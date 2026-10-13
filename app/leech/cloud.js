/* Two-pass WebGL 2 renderer for the full 196,560-vector cloud. */
(function (global) {
  'use strict';

  var VERTEX_SOURCE = `#version 300 es
    precision highp float;
    precision highp int;
    layout(location=0) in vec4 a_c0;
    layout(location=1) in vec4 a_c1;
    layout(location=2) in vec4 a_c2;
    layout(location=3) in vec4 a_c3;
    layout(location=4) in vec4 a_c4;
    layout(location=5) in vec4 a_c5;
    layout(location=6) in uvec4 a_class;
    uniform vec4 u_rowX[6];
    uniform vec4 u_rowY[6];
    uniform vec4 u_selected[6];
    uniform vec2 u_size;
    uniform vec2 u_centre;
    uniform float u_scale;
    uniform float u_pointSize;
    uniform int u_mode;
    uniform int u_octad;
    uniform float u_weights[8];
    flat out int v_class;
    void main() {
      vec4 c[6] = vec4[6](a_c0,a_c1,a_c2,a_c3,a_c4,a_c5);
      float x=0.0, y=0.0;
      for (int i=0;i<6;i++) { x += dot(c[i],u_rowX[i]); y += dot(c[i],u_rowY[i]); }
      int cls = int(a_class.x);
      if (u_mode==1) cls = u_octad==0 ? int(a_class.y) : (u_octad==1 ? int(a_class.z) : int(a_class.w));
      if (u_mode==2) {
        float product=0.0;
        for (int j=0;j<6;j++) product += dot(c[j],u_selected[j]);
        int p=int(round(product));
        cls = p==32 ? 0 : (p==16 ? 1 : (p==8 ? 2 : (p==0 ? 3 : (p==-8 ? 4 : (p==-16 ? 5 : 6)))));
      }
      if (u_mode==3) cls=0;
      v_class=cls;
      vec2 pixel=u_centre+vec2(x,-y)*u_scale;
      vec2 clip=vec2(pixel.x/u_size.x*2.0-1.0,1.0-pixel.y/u_size.y*2.0);
      gl_Position=u_weights[cls]<=0.0 ? vec4(2.0,2.0,0.0,1.0) : vec4(clip,0.0,1.0);
      gl_PointSize=u_pointSize;
    }`;

  var COUNT_FRAGMENT = `#version 300 es
    precision highp float;
    precision highp int;
    flat in int v_class;
    layout(location=0) out vec4 outLow;
    layout(location=1) out vec4 outHigh;
    void main() {
      vec2 p=gl_PointCoord*2.0-1.0;
      if (dot(p,p)>1.0) discard;
      outLow=vec4(0.0); outHigh=vec4(0.0);
      float one=1.0/255.0;
      if (v_class==0) outLow.r=one;
      else if (v_class==1) outLow.g=one;
      else if (v_class==2) outLow.b=one;
      else if (v_class==3) outLow.a=one;
      else if (v_class==4) outHigh.r=one;
      else if (v_class==5) outHigh.g=one;
      else if (v_class==6) outHigh.b=one;
      else outHigh.a=one;
    }`;

  var SHOW_VERTEX = `#version 300 es
    precision highp float;
    const vec2 P[3]=vec2[3](vec2(-1.0,-1.0),vec2(3.0,-1.0),vec2(-1.0,3.0));
    void main(){ gl_Position=vec4(P[gl_VertexID],0.0,1.0); }`;

  var SHOW_FRAGMENT = `#version 300 es
    precision highp float;
    uniform sampler2D u_low;
    uniform sampler2D u_high;
    uniform vec3 u_colours[8];
    uniform float u_weights[8];
    uniform vec3 u_background;
    uniform float u_brightness;
    uniform float u_nRef;
    uniform float u_opacity;
    out vec4 outColour;
    void main(){
      ivec2 at=ivec2(gl_FragCoord.xy);
      vec4 lo=round(texelFetch(u_low,at,0)*255.0);
      vec4 hi=round(texelFetch(u_high,at,0)*255.0);
      float n[8]=float[8](lo.r,lo.g,lo.b,lo.a,hi.r,hi.g,hi.b,hi.a);
      float total=0.0; vec3 mixed=vec3(0.0);
      for(int i=0;i<8;i++){ float amount=u_weights[i]*n[i]; total+=amount; mixed+=amount*u_colours[i]; }
      if(total<0.5){ outColour=vec4(u_background,1.0); return; }
      mixed/=total;
      float b=clamp(log(1.0+u_brightness*total)/log(1.0+u_brightness*u_nRef),0.0,1.0);
      vec3 colour=mix(u_background,mixed,b*u_opacity);
      float lift=clamp((b-0.85)/0.15,0.0,1.0)*0.6*u_opacity;
      outColour=vec4(mix(colour,vec3(1.0),lift),1.0);
    }`;

  function shader(gl, type, source) {
    var value=gl.createShader(type);
    gl.shaderSource(value,source); gl.compileShader(value);
    if (!gl.getShaderParameter(value,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(value));
    return value;
  }

  function program(gl, vertex, fragment) {
    var value=gl.createProgram();
    gl.attachShader(value,shader(gl,gl.VERTEX_SHADER,vertex));
    gl.attachShader(value,shader(gl,gl.FRAGMENT_SHADER,fragment));
    gl.linkProgram(value);
    if (!gl.getProgramParameter(value,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(value));
    return value;
  }

  function create(canvas, options) {
    var gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true});
    var api={supported:!!gl, resize:resize, draw:draw, destroy:destroy, loseContext:loseContext};
    if (!gl) return api;
    var data=options, lost=false, countProgram, showProgram, vao, buffer, framebuffer, textures=[], width=1, height=1, dpr=1;

    function build() {
      countProgram=program(gl,VERTEX_SOURCE,COUNT_FRAGMENT);
      showProgram=program(gl,SHOW_VERTEX,SHOW_FRAGMENT);
      vao=gl.createVertexArray(); buffer=gl.createBuffer();
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      var packed=new Uint8Array(data.coords.length/24*28), count=data.coords.length/24;
      for(var i=0;i<count;i++) {
        var target=i*28, source=i*24;
        for(var k=0;k<24;k++) packed[target+k]=data.coords[source+k]&255;
        packed[target+24]=data.shape[i];
        packed[target+25]=data.shells[0][i]; packed[target+26]=data.shells[1][i]; packed[target+27]=data.shells[2][i];
      }
      gl.bufferData(gl.ARRAY_BUFFER,packed,gl.STATIC_DRAW);
      for(var a=0;a<6;a++) { gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a,4,gl.BYTE,false,28,a*4); }
      gl.enableVertexAttribArray(6); gl.vertexAttribIPointer(6,4,gl.UNSIGNED_BYTE,28,24);
      gl.bindVertexArray(null);
      framebuffer=gl.createFramebuffer();
      makeTargets();
    }

    function makeTargets() {
      if (!framebuffer) return;
      textures.forEach(function(texture){ gl.deleteTexture(texture); }); textures=[];
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
      for(var i=0;i<2;i++) {
        var texture=gl.createTexture(); textures.push(texture); gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,texture,0);
      }
      gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Cloud count framebuffer is incomplete');
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    }

    function resize(cssWidth,cssHeight,nextDpr) {
      dpr=Math.min(2,nextDpr||1); var w=Math.max(1,Math.round(cssWidth*dpr)), h=Math.max(1,Math.round(cssHeight*dpr));
      if(w===width&&h===height) return; width=w;height=h;canvas.width=w;canvas.height=h;
      if(!lost) makeTargets();
    }

    function setCountUniforms(input) {
      var rows=input.rows, rowX=new Float32Array(24), rowY=new Float32Array(24);
      for(var i=0;i<24;i++){ rowX[i]=rows[i]; rowY[i]=rows[24+i]; }
      gl.uniform4fv(gl.getUniformLocation(countProgram,'u_rowX[0]'),rowX);
      gl.uniform4fv(gl.getUniformLocation(countProgram,'u_rowY[0]'),rowY);
      var selected=new Float32Array(24);
      if(input.selected) for(var j=0;j<24;j++) selected[j]=input.selected[j];
      gl.uniform4fv(gl.getUniformLocation(countProgram,'u_selected[0]'),selected);
      gl.uniform2f(gl.getUniformLocation(countProgram,'u_size'),width,height);
      gl.uniform2f(gl.getUniformLocation(countProgram,'u_centre'),input.centre[0]*dpr,input.centre[1]*dpr);
      gl.uniform1f(gl.getUniformLocation(countProgram,'u_scale'),input.scale*dpr);
      gl.uniform1f(gl.getUniformLocation(countProgram,'u_pointSize'),Math.max(1,input.pointSize*dpr));
      gl.uniform1i(gl.getUniformLocation(countProgram,'u_mode'),input.mode);
      gl.uniform1i(gl.getUniformLocation(countProgram,'u_octad'),input.octad);
      gl.uniform1fv(gl.getUniformLocation(countProgram,'u_weights[0]'),input.weights);
    }

    function draw(input) {
      if(lost||!countProgram) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer); gl.viewport(0,0,width,height);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
      gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE);
      gl.useProgram(countProgram); setCountUniforms(input); gl.bindVertexArray(vao);
      gl.drawArrays(gl.POINTS,0,data.coords.length/24);
      gl.disable(gl.BLEND); gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,width,height);
      gl.useProgram(showProgram);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[0]);gl.uniform1i(gl.getUniformLocation(showProgram,'u_low'),0);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,textures[1]);gl.uniform1i(gl.getUniformLocation(showProgram,'u_high'),1);
      gl.uniform3fv(gl.getUniformLocation(showProgram,'u_colours[0]'),input.colours);
      gl.uniform1fv(gl.getUniformLocation(showProgram,'u_weights[0]'),input.weights);
      gl.uniform3fv(gl.getUniformLocation(showProgram,'u_background'),input.background);
      gl.uniform1f(gl.getUniformLocation(showProgram,'u_brightness'),input.brightness);
      var nRef=Math.max(2,196560*11/(4*Math.PI)/Math.pow(input.scale*dpr,2));
      gl.uniform1f(gl.getUniformLocation(showProgram,'u_nRef'),nRef);
      gl.uniform1f(gl.getUniformLocation(showProgram,'u_opacity'),input.opacity===undefined?1:input.opacity);
      gl.bindVertexArray(null);gl.drawArrays(gl.TRIANGLES,0,3);
    }

    function loseContext() { var extension=gl.getExtension('WEBGL_lose_context'); if(extension){extension.loseContext();setTimeout(function(){extension.restoreContext();},120);} }
    function destroy() { if(!gl)return; textures.forEach(function(t){gl.deleteTexture(t);}); if(buffer)gl.deleteBuffer(buffer);if(vao)gl.deleteVertexArray(vao);if(framebuffer)gl.deleteFramebuffer(framebuffer);if(countProgram)gl.deleteProgram(countProgram);if(showProgram)gl.deleteProgram(showProgram); }
    canvas.addEventListener('webglcontextlost',function(event){event.preventDefault();lost=true;});
    canvas.addEventListener('webglcontextrestored',function(){lost=false;build();});
    try { build(); } catch(error) { console.error(error); api.supported=false; destroy(); }
    return api;
  }

  global.LeechCloud={create:create};
})(typeof window==='undefined'?globalThis:window);
