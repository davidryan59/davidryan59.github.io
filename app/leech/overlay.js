/* Canvas overlay for guides, exact spots, sparse discs, edges and markers. */
(function (global) {
  'use strict';

  function create(canvas) {
    var ctx=canvas.getContext('2d'), width=1, height=1, dpr=1;

    function resize(cssWidth,cssHeight,nextDpr) {
      width=Math.max(1,cssWidth);height=Math.max(1,cssHeight);dpr=Math.min(2,nextDpr||1);
      var w=Math.round(width*dpr),h=Math.round(height*dpr);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }

    var probe=null,cssCache=new Map();
    function css(name){
      var root=document.documentElement,key=name+'|'+(root.dataset.theme||'')+'|'+matchMedia('(prefers-color-scheme: dark)').matches;
      if(cssCache.has(key))return cssCache.get(key);
      if(!probe){probe=document.createElement('span');probe.hidden=true;root.appendChild(probe);}
      probe.style.color='var('+name+')';var value=getComputedStyle(probe).color;cssCache.set(key,value);return value;
    }
    function hexRgb(hex){var n=parseInt(hex.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255];}
    function mixedColour(counts,colours,weights) {
      var total=0,r=0,g=0,b=0;
      for(var i=0;i<counts.length;i++){var amount=counts[i]*(weights[i]===undefined?1:weights[i]);if(!amount)continue;var c=hexRgb(colours[i]);total+=amount;r+=amount*c[0];g+=amount*c[1];b+=amount*c[2];}
      if(!total)return null;
      return 'rgb('+Math.round(r/total)+','+Math.round(g/total)+','+Math.round(b/total)+')';
    }

    function guides(input) {
      ctx.save();ctx.strokeStyle=css('--guide');ctx.lineWidth=1;ctx.setLineDash([3,7]);ctx.beginPath();
      ctx.arc(input.centre[0],input.centre[1],2*input.scale,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=input.centreColour||css('--guide');ctx.beginPath();
      ctx.arc(input.centre[0],input.centre[1],input.centreRadius||2.5,0,Math.PI*2);ctx.fill();ctx.restore();
    }

    function lines(input) {
      if(!input.lines||!input.lines.length)return;
      ctx.save();ctx.strokeStyle=css('--edge');ctx.lineWidth=input.lineWidth||.75;
      for(var i=0;i<input.lines.length;i++){
        var line=input.lines[i];ctx.globalAlpha=(line[4]===undefined?1:line[4])*(input.edgeStrength||.12);ctx.beginPath();ctx.moveTo(line[0],line[1]);ctx.lineTo(line[2],line[3]);ctx.stroke();
      }
      ctx.restore();
    }

    function spots(input) {
      if(!input.groups)return;
      var buckets=new Map(), maximum=input.maxPile||4320, base=.012*Math.min(width,height)*(input.dotSize||1);
      var selected=null;
      for(var i=0;i<input.groups.length;i++){
        var group=input.groups[i];if(group.hidden)continue;
        var colour=mixedColour(group.counts,input.colours,input.weights);if(!colour)continue;
        var radius=input.discs?Math.max(1,2*(input.dotSize||1)):input.raw?2.5*(input.dotSize||1):Math.max(1.6,base*Math.cbrt(group.pile/maximum));
        group.radius=radius;
        if(group.selected){selected={group:group,colour:colour,radius:radius};continue;}
        var key=colour+'|'+(group.outer?'1':'0');if(!buckets.has(key))buckets.set(key,{colour:colour,outer:group.outer,items:[]});buckets.get(key).items.push(group);
      }
      buckets.forEach(function(bucket){
        ctx.save();ctx.fillStyle=bucket.colour;ctx.beginPath();bucket.items.forEach(function(group){ctx.moveTo(group.x+group.radius,group.y);ctx.arc(group.x,group.y,group.radius,0,Math.PI*2);});ctx.fill();
        if(bucket.outer){ctx.strokeStyle=css('--outline');ctx.lineWidth=1;ctx.stroke();}ctx.restore();
      });
      if(selected){var g=selected.group,r=selected.radius*1.4;ctx.save();ctx.shadowColor=css('--halo');ctx.shadowBlur=13;ctx.fillStyle=selected.colour;ctx.strokeStyle=css('--outline');ctx.lineWidth=2;ctx.beginPath();ctx.arc(g.x,g.y,r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();g.radius=r;}
    }

    function markers(input) {
      if(!input.marker)return;
      function ring(point,radius,alpha){if(!point)return;ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=css('--halo');ctx.lineWidth=2;ctx.shadowColor=css('--halo');ctx.shadowBlur=radius>5?10:0;ctx.beginPath();ctx.arc(point[0],point[1],radius,0,Math.PI*2);ctx.stroke();ctx.restore();}
      ring(input.marker,8,1);
    }

    function draw(input) {
      ctx.clearRect(0,0,width,height);guides(input);lines(input);ctx.save();ctx.globalAlpha=input.spotOpacity===undefined?1:input.spotOpacity;spots(input);ctx.restore();markers(input);
    }

    return {resize:resize,draw:draw,context:ctx};
  }

  global.LeechOverlay={create:create};
})(typeof window==='undefined'?globalThis:window);
