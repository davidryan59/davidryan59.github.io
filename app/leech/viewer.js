(function () {
  'use strict';

  var $=function(id){return document.getElementById(id);};
  var stage=$('stage'),overlayCanvas=$('overlay'),cloudCanvas=$('cloud');
  var overlay=LeechOverlay.create(overlayCanvas);
  var data=Leech.build();
  var shells=Leech.TRIO.map(function(octad){return Leech.shells(data.coords,octad);});
  var groupings=[null,null,null];
  function grouping(index){if(!groupings[index])groupings[index]=Leech.octadSpots(data.coords,data.shape,Leech.TRIO[index]);return groupings[index];}
  var scenes=LeechScenes.build({Leech:Leech,Frame:Frame,E8:E8,data:data});
  var sceneById=new Map(scenes.map(function(scene){return[scene.id,scene];}));
  var cloud=LeechCloud.create(cloudCanvas,{coords:data.coords,shape:data.shape,shells:shells});
  var reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var width=1,height=1,dpr=1,scale=1,centre=[.5,.5],lastTime=performance.now(),transition=null,nextAnimation=null;
  var projected=new Float32Array(Leech.COUNT*2),projectionValid=false,currentGroups=[],visibleCache=null,crystalCache=new Map();
  var pointers=new Map(),pinch=null,drag=null,tourIndex=0,tourDeadline=0,hashTimer=0,renderSamples=[];
  var previousRenderer='spots',crystalFadeStart=0;
  var initialDriftAt=performance.now()+2600;
  var SQRT8=Math.sqrt(8);

  var palettes={
    dark:{
      shells:['#8995a7','#a78bfa','#64a9f3','#f2cf55'],shapes:['#f2cf55','#64a9f3','#ef83c2'],
      layers:['#f0b96e','#58d4c2','#83d58a','#8995a7','#b59be7','#f17f9f','#fb9b61'],mono:['#b9c5d4']
    },
    light:{
      shells:['#76808d','#7447b8','#2563b8','#947000'],shapes:['#947000','#2563b8','#b52b75'],
      layers:['#9a6300','#087f72','#387b42','#76808d','#7756b0','#b93f60','#bf5a24'],mono:['#46566a']
    }
  };
  var legendNames={shells:['Centre','Inner','Middle','Outer · E8'],shapes:['Shape A','Shape B','Shape C'],layers:['The ball · 0°','60°','75.5°','90°','104.5°','120°','Opposite · 180°'],mono:['All balls']};
  var legendCounts={shells:['4,320','122,880','69,120','240'],shapes:['1,104','97,152','98,304'],layers:['1','4,600','47,104','93,150','47,104','4,600','1'],mono:['196,560']};
  var layerAngles=['0°','60°','75.52°','90°','104.48°','120°','180°'];
  var layerCounts=[1,4600,47104,93150,47104,4600,1];
  var tourOrder=['petrie','cox7','octagonal','squares','e8edges','weave','cloud','hexagon','coordinates','layers','rings23','sunburst','rosette11','cloud23'];

  var state={
    scene:'petrie',window:8,octad:0,tilt:0,frame:null,colour:'shells',edges:'none',weights:[1,1,1,1,1,1,1,1],
    selected:0,defaultSelected:0,zoom:1,sceneZoom:1,dotSize:1,edgeStrength:.12,brightness:1,speed:.4,depth:2,playing:!reducedMotion,
    motion:'drift',changedAt:performance.now(),dragging:false,renderer:'spots',spotCount:2641,visibleCount:Leech.COUNT,spokeCount:0
  };

  function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
  function smooth(value){return value*value*(3-2*value);}
  function isDark(){return document.documentElement.dataset.theme==='dark';}
  function palette(){return palettes[isDark()?'dark':'light'][state.colour];}
  function invalidate(moved){projectionValid=false;visibleCache=null;if(moved!==false){state.changedAt=performance.now();crystalCache.clear();}}
  function copyRows(rows){return rows.map(function(row){return new Float64Array(row);});}
  function rowVector(index){return new Int8Array(data.coords.slice(index*24,index*24+24));}
  function realVector(index){var integers=rowVector(index),real=new Float64Array(24);for(var i=0;i<24;i++)real[i]=integers[i]/SQRT8;return real;}

  function frameForScene(scene,octadIndex) {
    var rows=copyRows(scene.rows);
    if(scene.window===8&&octadIndex!==scene.octad){
      var from=Leech.TRIO[scene.octad],to=Leech.TRIO[octadIndex];
      rows=rows.map(function(row){var moved=new Float64Array(24);for(var i=0;i<8;i++)moved[to[i]]=row[from[i]];return moved;});
    }
    return scene.window===8?Frame.octadFrame(rows[0],rows[1],Leech.TRIO[octadIndex]):Frame.complete(rows);
  }

  function displayRows(){
    if(state.window===8&&state.tilt>1e-9)return Frame.tilted(state.frame,state.tilt,Leech.TRIO[state.octad],Leech.TRIO[(state.octad+1)%3]);
    return[state.frame[0],state.frame[1]];
  }

  function modeIndex(){return state.colour==='shapes'?0:state.colour==='shells'?1:state.colour==='layers'?2:3;}
  function classFor(index){
    if(state.colour==='shapes')return data.shape[index];
    if(state.colour==='shells')return shells[state.octad][index];
    if(state.colour==='layers')return Leech.layer(dotIndex(state.selected,index));
    return 0;
  }
  function dotIndex(a,b){var total=0,ao=a*24,bo=b*24;for(var i=0;i<24;i++)total+=data.coords[ao+i]*data.coords[bo+i];return total;}
  function visible(index){return(state.weights[classFor(index)]||0)>0;}
  function visibleIndices(){
    if(visibleCache)return visibleCache;
    var list=[];for(var i=0;i<Leech.COUNT;i++)if(visible(i))list.push(i);visibleCache=list;return list;
  }

  function sceneExtent(scene) {
    if(scene&&scene.expect&&scene.expect.maxRadius)return scene.expect.maxRadius;
    return 2;
  }
  function setSceneZoom(scene){state.zoom=clamp(1.9/sceneExtent(scene),.5,4);state.sceneZoom=state.zoom;}

  function applyScene(id,immediate,fromTour) {
    var scene=sceneById.get(id);if(!scene)return;
    if(scene.window===24&&!cloud.supported){$('unsupported').hidden=false;return;}
    $('unsupported').hidden=true;
    var target=frameForScene(scene,scene.octad),from=state.frame?Frame.copy(state.frame):target,priorWindow=state.window;
    var priorSettings={colour:state.colour,edges:state.edges,weights:state.weights.slice(),selected:state.selected,defaultSelected:state.defaultSelected};
    var targetWeights=[1,1,1,1,1,1,1,1];if(scene.weights)scene.weights.forEach(function(value,index){targetWeights[index]=value;});
    var targetSelected=scene.selected!==null?scene.selected:state.selected,targetDefault=scene.selected!==null?scene.selected:state.defaultSelected;
    state.scene=id;state.window=scene.window;state.octad=scene.octad;state.tilt=scene.tilt||0;
    if(!fromTour||immediate){state.colour=scene.colour;state.edges=scene.edges||'none';state.weights=targetWeights;state.selected=targetSelected;state.defaultSelected=targetDefault;}
    setSceneZoom(scene);
    if(immediate||!state.frame){state.frame=target;transition=null;}else{
      var aligned=Frame.alignPlane(from.slice(0,2),target.slice(0,2));target=Frame.complete(aligned,target.slice(2));
      transition={from:from,to:target,start:performance.now(),duration:fromTour?3000:900,id:id,crossWindow:priorWindow!==scene.window};
      if(fromTour)transition.tour={from:priorSettings,to:{colour:scene.colour,edges:scene.edges||'none',weights:targetWeights,selected:targetSelected,defaultSelected:targetDefault},midpoint:false};
    }
    invalidate();updateControls();updateDetails();writeHash();
    if(!fromTour)tourIndex=Math.max(0,tourOrder.indexOf(id));
  }

  function switchWindow(next) {
    if(next===state.window)return;
    if(next===24){if(!cloud.supported){$('unsupported').hidden=false;return;}state.window=24;state.tilt=0;}
    else{
      var positions=Leech.TRIO[state.octad],rows=[new Float64Array(24),new Float64Array(24)];
      for(var r=0;r<2;r++)for(var k=0;k<8;k++)rows[r][positions[k]]=state.frame[r][positions[k]];
      var lengths=rows.map(function(row){return Math.sqrt(Frame.dot(row,row));});
      if(lengths[0]<.3||lengths[1]<.3){applyScene('petrie',false);return;}
      rows=Frame.orthonormalise(rows);if(rows.length<2){applyScene('petrie',false);return;}
      state.frame=Frame.octadFrame(rows[0],rows[1],positions);state.window=8;state.tilt=0;state.scene=null;
    }
    invalidate();updateControls();writeHash();
  }

  function selectDefault() {
    var groups=grouping(state.octad),rows=displayRows(),best=-1,bestRadius=-1;
    groups.spots.forEach(function(spot){if(spot.shell!==3)return;var x=0,y=0;for(var k=0;k<8;k++){x+=rows[0][groups.positions[k]]*spot.coords[k]/SQRT8;y+=rows[1][groups.positions[k]]*spot.coords[k]/SQRT8;}var radius=x*x+y*y;if(radius>bestRadius){bestRadius=radius;best=groups.order[spot.start];}});
    if(best>=0)state.selected=best;
  }

  function resize(){
    var rect=stage.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);dpr=Math.min(2,devicePixelRatio||1);centre=[width/2,height/2];
    overlay.resize(width,height,dpr);cloud.resize(width,height,dpr);invalidate(false);
  }

  function calculateProjection(){
    if(projectionValid)return;var rows=displayRows();scale=.2*Math.min(width,height)*state.zoom;
    for(var i=0;i<Leech.COUNT;i++){var x=0,y=0,offset=i*24;for(var k=0;k<24;k++){var value=data.coords[offset+k]/SQRT8;x+=rows[0][k]*value;y+=rows[1][k]*value;}projected[2*i]=centre[0]+x*scale;projected[2*i+1]=centre[1]-y*scale;}
    projectionValid=true;
  }

  function projectIndex(index) {
    var rows=displayRows(),x=0,y=0,offset=index*24;
    for(var k=0;k<24;k++){var value=data.coords[offset+k]/SQRT8;x+=rows[0][k]*value;y+=rows[1][k]*value;}
    return[centre[0]+x*scale,centre[1]-y*scale];
  }

  function countsForMembers(members) {
    var counts=new Array(8).fill(0);for(var i=0;i<members.length;i++)counts[classFor(members[i])]++;return counts;
  }

  function octadGroups() {
    var source=grouping(state.octad),rows=displayRows(),result=[];
    for(var i=0;i<source.spots.length;i++){
      var spot=source.spots[i],x=0,y=0;for(var k=0;k<8;k++){x+=rows[0][source.positions[k]]*spot.coords[k]/SQRT8;y+=rows[1][source.positions[k]]*spot.coords[k]/SQRT8;}
      var members=source.order.subarray(spot.start,spot.end),counts;
      if(state.colour==='shells'){counts=new Array(8).fill(0);counts[spot.shell]=spot.pile;}
      else if(state.colour==='shapes'&&spot.shape!==255){counts=new Array(8).fill(0);counts[spot.shape]=spot.pile;}
      else if(state.colour==='mono'){counts=[spot.pile,0,0,0,0,0,0,0];}
      else counts=countsForMembers(members);
      result.push({x:centre[0]+x*scale,y:centre[1]-y*scale,pile:spot.pile,counts:counts,outer:spot.shell===3,selected:source.spot[state.selected]===spot.id,spot:spot,members:members,representative:source.order[spot.start]});
    }
    return result;
  }

  function sparseGroups() {
    calculateProjection();return visibleIndices().map(function(index){var counts=new Array(8).fill(0);counts[classFor(index)]=1;return{x:projected[2*index],y:projected[2*index+1],pile:1,counts:counts,selected:index===state.selected,representative:index,members:[index]};});
  }

  function crystalKey(){return state.scene||'free';}
  function crystallise() {
    var key=crystalKey();if(crystalCache.has(key))return crystalCache.get(key);
    calculateProjection();var map=new Map(),indices=visibleIndices();
    for(var n=0;n<indices.length;n++){
      var index=indices[n],px=projected[2*index],py=projected[2*index+1];
      var x=(px-centre[0])/scale,y=(centre[1]-py)/scale,k=Math.round(x*1e6)+','+Math.round(y*1e6),group=map.get(k);
      if(!group){group={x:px,y:py,pile:0,counts:new Array(8).fill(0),members:[],representative:index};map.set(k,group);}
      group.pile++;group.counts[classFor(index)]++;group.members.push(index);if(index===state.selected)group.selected=true;
    }
    var result=Array.from(map.values());crystalCache.set(key,result);return result;
  }

  function edgeLines(groups) {
    var lines=[];state.spokeCount=0;if(state.edges==='none')return lines;
    if(state.edges==='e8'&&state.window===8&&state.tilt<1e-9){
      var outer=groups.filter(function(group){return group.outer;}),byIndex=new Map();outer.forEach(function(group){byIndex.set(group.representative,group);});
      for(var i=0;i<outer.length;i++)for(var j=i+1;j<outer.length;j++)if(dotIndex(outer[i].representative,outer[j].representative)===16)lines.push([outer[i].x,outer[i].y,outer[j].x,outer[j].y,1]);
      return lines;
    }
    if(state.edges==='spokes'&&state.selected>=0){
      calculateProjection();var neighbours=Leech.neighbours(data.coords,state.selected);state.spokeCount=neighbours.length;
      if(state.window===8&&state.tilt<1e-9){
        var lookup=new Map();groups.forEach(function(group){lookup.set(group.spot.id,group);});var source=grouping(state.octad),counts=new Map();
        neighbours.forEach(function(index){var id=source.spot[index];counts.set(id,(counts.get(id)||0)+1);});
        var selected=lookup.get(source.spot[state.selected]);counts.forEach(function(count,id){var target=lookup.get(id);if(target&&selected)lines.push([selected.x,selected.y,target.x,target.y,.25+.75*Math.sqrt(count/512)]);});
      }else{
        var sx=projected[2*state.selected],sy=projected[2*state.selected+1];neighbours.forEach(function(index){lines.push([sx,sy,projected[2*index],projected[2*index+1],1]);});
      }
    }
    return lines;
  }

  function markerPositions() {
    if(state.selected<0)return{marker:null,opposite:null};
    var vector=rowVector(state.selected),negative=new Int8Array(24);for(var i=0;i<24;i++)negative[i]=-vector[i];var opposite=Leech.indexOf(negative);
    return{marker:projectIndex(state.selected),opposite:opposite>=0?projectIndex(opposite):null};
  }

  function rgbFloats(colours){var out=new Float32Array(24);for(var i=0;i<8;i++){var colour=colours[Math.min(i,colours.length-1)],n=parseInt(colour.slice(1),16);out[3*i]=((n>>16)&255)/255;out[3*i+1]=((n>>8)&255)/255;out[3*i+2]=(n&255)/255;}return out;}

  function draw(now) {
    var drawStart=performance.now();updateAnimation(now);
    scale=.2*Math.min(width,height)*state.zoom;
    var visibleCount=visibleIndices().length,renderer,groups=null,crystallized=false;
    if(state.window===8&&state.tilt<1e-9&&!(transition&&transition.crossWindow))renderer='spots';
    else if(visibleCount<=6000)renderer='discs';
    else if(!state.playing&&!state.dragging&&!transition&&!nextAnimation&&now-state.changedAt>200){var crystal=crystallise();renderer=crystal.length<=4000?'spots':'cloud';if(renderer==='spots'){groups=crystal;crystallized=true;}}
    else renderer='cloud';
    if(renderer==='cloud')crystalFadeStart=0;else if(crystallized&&previousRenderer==='cloud'&&!crystalFadeStart)crystalFadeStart=now;
    var spotOpacity=crystalFadeStart?clamp((now-crystalFadeStart)/300,0,1):1,drawCloud=renderer==='cloud'||crystallized&&spotOpacity<1;
    if(spotOpacity>=1)crystalFadeStart=0;
    state.renderer=renderer;state.visibleCount=visibleCount;
    cloudCanvas.style.visibility=drawCloud?'visible':'hidden';cloudCanvas.style.opacity=drawCloud&&renderer!=='cloud'?String(1-spotOpacity):'1';$('brightness-row').hidden=renderer!=='cloud';
    var colours=palette(),markers=markerPositions();
    if(drawCloud){
      var rows=displayRows(),uniformRows=new Float32Array(48);for(var i=0;i<24;i++){uniformRows[i]=rows[0][i]/SQRT8;uniformRows[24+i]=rows[1][i]/SQRT8;}
      cloud.draw({rows:uniformRows,centre:centre,scale:scale,pointSize:Math.max(1.25,2*state.dotSize),mode:modeIndex(),octad:state.octad,selected:state.colour==='layers'?rowVector(state.selected):null,colours:rgbFloats(colours),weights:new Float32Array(state.weights),background:isDark()?[17/255,19/255,24/255]:[246/255,243/255,236/255],brightness:state.brightness,opacity:1});
    }
    if(!groups){if(renderer==='spots')groups=state.window===8&&state.tilt<1e-9?octadGroups():crystallise();else if(renderer==='discs')groups=sparseGroups();else groups=[];}
    currentGroups=groups;state.spotCount=renderer==='spots'?groups.length:0;
    var lines=edgeLines(groups);
    overlay.draw({centre:centre,scale:scale,groups:groups,discs:renderer==='discs',maxPile:groups.reduce(function(max,g){return Math.max(max,g.pile);},1),colours:colours,weights:state.weights,dotSize:state.dotSize,lines:lines,edgeStrength:state.edges==='spokes'?Math.min(.2,state.edgeStrength):state.edgeStrength,lineWidth:state.edges==='spokes'?.7:.65,spotOpacity:spotOpacity,marker:renderer==='cloud'?markers.marker:null,opposite:renderer==='cloud'?markers.opposite:null});
    $('renderer-status').textContent=renderer==='cloud'?visibleCount.toLocaleString()+' balls · WebGL 2':renderer==='discs'?visibleCount.toLocaleString()+' balls':groups.length.toLocaleString()+' spots';
    previousRenderer=renderer;renderSamples.push(performance.now()-drawStart);if(renderSamples.length>120)renderSamples.shift();
  }

  function updateAnimation(now) {
    var dt=Math.min(.05,(now-lastTime)/1000);lastTime=now;
    if(transition){var amount=clamp((now-transition.start)/transition.duration,0,1);state.frame=Frame.interpolate(transition.from,transition.to,smooth(amount));
      if(transition.tour){for(var weight=0;weight<8;weight++)state.weights[weight]=transition.tour.from.weights[weight]*(1-amount)+transition.tour.to.weights[weight]*amount;if(amount>=.5&&!transition.tour.midpoint){transition.tour.midpoint=true;state.colour=transition.tour.to.colour;state.edges=transition.tour.to.edges;state.selected=transition.tour.to.selected;state.defaultSelected=transition.tour.to.defaultSelected;updateControls();updateDetails();writeHash();}}
      invalidate();if(amount>=1){if(transition.tour)state.weights=transition.tour.to.weights.slice();transition=null;}}
    else if(nextAnimation){var progress=clamp((now-nextAnimation.start)/4000,0,1);state.tilt=smooth(progress)*Math.PI/2;invalidate();if(progress>=1){var old=state.octad,next=(old+1)%3,rows=Frame.tiltTarget(state.frame[0],state.frame[1],Leech.TRIO[old],Leech.TRIO[next]);state.octad=next;state.frame=Frame.octadFrame(rows[0],rows[1],Leech.TRIO[next]);state.tilt=0;nextAnimation=null;invalidate();updateControls();writeHash();}}
    else if(state.playing&&state.motion==='drift'&&!state.dragging&&now>=initialDriftAt){Frame.drift(state.frame,dt,state.speed,state.window-1);invalidate();}
    if(state.playing&&state.motion==='tour'&&!state.dragging&&!transition&&now>=tourDeadline){tourIndex=(tourIndex+1)%tourOrder.length;applyScene(tourOrder[tourIndex],false,true);tourDeadline=now+8000;}
    $('tilt').value=Math.round(state.tilt*180/Math.PI);$('tilt-output').value=Math.round(state.tilt*180/Math.PI)+'°';
  }

  function loop(now){draw(now);requestAnimationFrame(loop);}

  function updateControls() {
    document.querySelectorAll('[data-window]').forEach(function(button){button.classList.toggle('active',Number(button.dataset.window)===state.window);button.disabled=Number(button.dataset.window)===24&&!cloud.supported;});
    document.querySelectorAll('.scene-button').forEach(function(button){button.classList.toggle('active',button.dataset.scene===state.scene);});
    document.querySelectorAll('[data-colour]').forEach(function(button){button.classList.toggle('active',button.dataset.colour===state.colour);button.disabled=button.dataset.colour==='layers'&&state.selected<0;});
    document.querySelectorAll('[data-edges]').forEach(function(button){button.classList.toggle('active',button.dataset.edges===state.edges);});
    document.querySelectorAll('[data-motion]').forEach(function(button){button.classList.toggle('active',button.dataset.motion===state.motion);});
    var tourButton=document.querySelector('[data-motion="tour"]');if(tourButton)tourButton.disabled=!cloud.supported;
    $('play').classList.toggle('active',state.playing);$('pause').classList.toggle('active',!state.playing);
    $('depth').max=state.window;$('depth').value=state.depth+1;$('depth-output').value=state.depth+1;
    $('tilt-controls').hidden=state.window!==8;buildLegend();
  }

  function buildSceneButtons() {
    var holder=$('scene-buttons');scenes.forEach(function(scene){
      var button=document.createElement('button');button.type='button';button.className='scene-button'+(scene.featured?' featured':'');button.dataset.scene=scene.id;
      button.innerHTML='<strong>'+scene.label+'</strong><span>'+scene.sub+'</span>';button.disabled=scene.window===24&&!cloud.supported;button.addEventListener('click',function(){applyScene(scene.id,false);});holder.appendChild(button);
    });
  }

  function buildLegend(){
    var holder=$('legend'),colours=palette(),names=legendNames[state.colour],counts=legendCounts[state.colour];holder.textContent='';
    names.forEach(function(name,index){var button=document.createElement('button');button.type='button';button.className='legend-row'+(state.weights[index]?'':' off');button.style.setProperty('--swatch',colours[index]);button.innerHTML='<i></i><span>'+name+'</span><span>'+counts[index]+'</span>';button.addEventListener('click',function(){state.weights[index]=state.weights[index]?0:1;invalidate();crystalCache.clear();buildLegend();writeHash();});holder.appendChild(button);});
  }

  function coordinateText(value){return value<0?'−'+Math.abs(value):String(value);}
  function selectedPile(){var source=grouping(state.octad),id=source.spot[state.selected],spot=source.spots[id];return{source:source,spot:spot,members:source.order.subarray(spot.start,spot.end)};}
  function updateDetails(){
    var scene=sceneById.get(state.scene);$('scene-name').textContent=scene?scene.label:'Free view';$('scene-caption').textContent=scene?scene.caption:'A free orthonormal projection made by direct manipulation.';
    if(state.selected<0){$('ball-name').textContent='No ball selected';$('coordinates').textContent='Tap a visible ball to select it.';$('ball-extra').textContent='';$('pile-stepper').hidden=true;$('spot-detail').textContent='';return;}var shape=['A','B','C'][data.shape[state.selected]],vector=rowVector(state.selected);$('ball-name').textContent='Ball '+state.selected.toLocaleString()+' · shape '+shape;
    $('coordinates').textContent='('+Array.from(vector,coordinateText).join(', ')+') ÷ √8';
    if(shape==='B')$('ball-extra').textContent='Octad positions: '+Array.from(vector).map(function(v,i){return v?i:null;}).filter(function(v){return v!==null;}).join(', ');
    else if(shape==='C'){var special=Array.from(vector).findIndex(function(value){return Math.abs(value)===3;});$('ball-extra').textContent='Codeword positions: '+Array.from(vector).map(function(v,i){return(i===special?v===3:v===-1)?i:null;}).filter(function(v){return v!==null;}).join(', ');}
    else $('ball-extra').textContent='Two coordinate positions carry ±4.';
    var pile=selectedPile(),at=Array.prototype.indexOf.call(pile.members,state.selected);$('pile-position').textContent='ball '+(at+1)+' of '+pile.members.length.toLocaleString();$('spot-detail').textContent=['Centre','Inner','Middle','Outer'][pile.spot.shell]+' shell · pile of '+pile.spot.pile.toLocaleString();$('pile-stepper').hidden=state.window!==8;
  }

  function buildLayerTable(){var holder=$('layer-table'),colours=paletteFor('layers');holder.textContent='';layerAngles.forEach(function(angle,index){var row=document.createElement('div');row.className='layer-row';row.style.setProperty('--swatch',colours[index]);row.innerHTML='<i></i><span>'+angle+'</span><strong>'+layerCounts[index].toLocaleString()+'</strong>';holder.appendChild(row);});}
  function paletteFor(name){return palettes[isDark()?'dark':'light'][name];}

  function setSelected(index){if(index<0||index>=Leech.COUNT)return;state.selected=index;visibleCache=null;crystalCache.clear();invalidate(false);updateDetails();updateControls();writeHash();}
  function stepPile(delta){var pile=selectedPile(),at=Array.prototype.indexOf.call(pile.members,state.selected),next=(at+delta+pile.members.length)%pile.members.length;setSelected(pile.members[next]);}

  function local(event){var rect=overlayCanvas.getBoundingClientRect();return[event.clientX-rect.left,event.clientY-rect.top];}
  function nearestGroup(point,extra){var best=null,distance=Infinity;currentGroups.forEach(function(group){var d=Math.hypot(point[0]-group.x,point[1]-group.y);if(d<distance&&d<=(group.radius||2)+extra){distance=d;best=group;}});return best;}
  function nearestBall(point,radius){calculateProjection();var best=-1,distance=radius;visibleIndices().forEach(function(index){var d=Math.hypot(point[0]-projected[2*index],point[1]-projected[2*index+1]);if(d<distance){distance=d;best=index;}});return best;}

  overlayCanvas.addEventListener('pointerdown',function(event){
    overlayCanvas.setPointerCapture(event.pointerId);var point=local(event);pointers.set(event.pointerId,point);state.dragging=true;state.playing=false;updateControls();
    if(pointers.size===2){var values=Array.from(pointers.values());pinch={distance:Math.hypot(values[0][0]-values[1][0],values[0][1]-values[1][1]),angle:Math.atan2(values[1][1]-values[0][1],values[1][0]-values[0][0]),zoom:state.zoom};return;}
    var marker=markerPositions().marker,hitMarker=marker&&Math.hypot(point[0]-marker[0],point[1]-marker[1])<=(event.pointerType==='touch'?20:12);
    var group=nearestGroup(point,event.pointerType==='touch'?13:7);drag={start:point,last:point,mode:hitMarker||group&&group.selected?'pull':(event.shiftKey||event.button===2?'roll':'orbit'),moved:false,group:group};overlayCanvas.classList.add('grabbing');
    if(group&&!hitMarker)setSelected(group.representative);
  });
  overlayCanvas.addEventListener('contextmenu',function(event){event.preventDefault();});
  overlayCanvas.addEventListener('pointermove',function(event){
    var point=local(event);if(pointers.has(event.pointerId))pointers.set(event.pointerId,point);
    if(pointers.size===2&&pinch){var values=Array.from(pointers.values()),distance=Math.hypot(values[0][0]-values[1][0],values[0][1]-values[1][1]),angle=Math.atan2(values[1][1]-values[0][1],values[1][0]-values[0][0]);state.zoom=clamp(pinch.zoom*distance/pinch.distance,.5,4);Frame.roll(state.frame,(angle-pinch.angle)/.007);pinch.angle=angle;invalidate();return;}
    if(drag&&pointers.has(event.pointerId)){var dx=point[0]-drag.last[0],dy=point[1]-drag.last[1];if(Math.hypot(point[0]-drag.start[0],point[1]-drag.start[1])>3)drag.moved=true;
      if(drag.mode==='pull')Frame.pull(state.frame,realVector(state.selected),dx,dy,scale,state.window-1);else if(drag.mode==='roll')Frame.roll(state.frame,dx);else Frame.orbit(state.frame,clamp(state.depth,2,state.window-1),dx,dy);
      drag.last=point;state.scene=null;invalidate();writeHash();return;
    }
    if(event.pointerType==='mouse'){var group=nearestGroup(point,7),card=$('hover-card');if(group){card.hidden=false;card.style.left=Math.min(width-230,point[0]+14)+'px';card.style.top=Math.min(height-80,point[1]+14)+'px';card.textContent=(group.spot?['Centre','Inner','Middle','Outer'][group.spot.shell]+' · ':'')+group.pile.toLocaleString()+' ball'+(group.pile===1?'':'s')+' · index '+group.representative.toLocaleString();}else card.hidden=true;}
  });
  function endPointer(event){
    var point=local(event),was=drag;pointers.delete(event.pointerId);if(pointers.size<2)pinch=null;
    if(was&&!was.moved&&state.renderer==='cloud'){var index=nearestBall(point,event.pointerType==='touch'?20:12);if(index>=0)setSelected(index);}
    if(!pointers.size){state.dragging=false;drag=null;overlayCanvas.classList.remove('grabbing');state.changedAt=performance.now();}
  }
  overlayCanvas.addEventListener('pointerup',endPointer);overlayCanvas.addEventListener('pointercancel',endPointer);
  overlayCanvas.addEventListener('wheel',function(event){event.preventDefault();state.zoom=clamp(state.zoom*Math.exp(-event.deltaY*.001),.5,4);invalidate(false);writeHash();},{passive:false});

  function writeHash(){
    clearTimeout(hashTimer);hashTimer=setTimeout(function(){
      var params=new URLSearchParams();
      if(state.scene&&state.scene!=='petrie')params.set('v',state.scene);
      if(!state.scene){var positions=state.window===8?Leech.TRIO[state.octad]:Array.from({length:24},function(_,i){return i;});params.set('p',Frame.encode(state.frame.slice(0,2),positions));}
      if(state.window!==8)params.set('w',state.window);if(state.octad)params.set('o',state.octad);if(state.tilt)params.set('t',Math.round(state.tilt*180/Math.PI));
      if(state.colour!=='shells')params.set('c',state.colour);if(state.edges!=='none')params.set('e',state.edges);
      var mask=0;state.weights.forEach(function(value,index){if(!value)mask|=1<<index;});if(mask)params.set('h',mask);
      if(state.selected>=0&&state.selected!==state.defaultSelected)params.set('r',state.selected);
      if(Math.abs(state.zoom-state.sceneZoom)>1e-3)params.set('z',state.zoom.toFixed(3));if(!state.playing)params.set('pause',1);
      if(state.speed!==.4)params.set('speed',state.speed.toFixed(2));if(state.depth!==2)params.set('d',state.depth+1);if(state.dotSize!==1)params.set('s',state.dotSize.toFixed(2));if(state.motion==='tour')params.set('m','tour');
      history.replaceState(null,'',location.pathname+(params.toString()?'#'+params.toString():''));
    },80);
  }

  function restoreHash(){
    var params=new URLSearchParams(location.hash.slice(1)),id=params.get('v')||'petrie';applyScene(sceneById.has(id)?id:'petrie',true);
    var nextWindow=Number(params.get('w'));if(nextWindow===24&&cloud.supported)state.window=24;
    var octad=Number(params.get('o'));if(octad>=0&&octad<3)state.octad=octad;
    var encoded=params.get('p');if(encoded){var positions=state.window===8?Leech.TRIO[state.octad]:Array.from({length:24},function(_,i){return i;}),rows=Frame.decode(encoded,positions);if(rows){state.frame=state.window===8?Frame.octadFrame(rows[0],rows[1],positions):Frame.complete(rows);state.scene=null;}}
    var tilt=Number(params.get('t'));if(tilt>=0&&tilt<=90)state.tilt=tilt*Math.PI/180;
    if(['shells','shapes','layers','mono'].includes(params.get('c')))state.colour=params.get('c');if(['none','e8','spokes'].includes(params.get('e')))state.edges=params.get('e');
    var mask=Number(params.get('h'))||0;for(var i=0;i<8;i++)if(mask&(1<<i))state.weights[i]=0;
    var selected=Number(params.get('r'));if(params.has('r')&&Number.isInteger(selected)&&selected>=0&&selected<Leech.COUNT)state.selected=selected;
    var zoom=Number(params.get('z'));if(zoom>=.5&&zoom<=4)state.zoom=zoom;if(params.get('pause')==='1')state.playing=false;
    var speed=Number(params.get('speed'));if(speed>=.05&&speed<=1)state.speed=speed;var depth=Number(params.get('d'));if(depth>=3&&depth<=24)state.depth=depth-1;
    var size=Number(params.get('s'));if(size>=.5&&size<=2)state.dotSize=size;if(params.get('m')==='tour')state.motion='tour';invalidate();
  }

  document.querySelectorAll('[data-window]').forEach(function(button){button.addEventListener('click',function(){switchWindow(Number(button.dataset.window));});});
  document.querySelectorAll('[data-colour]').forEach(function(button){button.addEventListener('click',function(){state.colour=button.dataset.colour;state.weights=[1,1,1,1,1,1,1,1];visibleCache=null;crystalCache.clear();invalidate(false);updateControls();writeHash();});});
  document.querySelectorAll('[data-edges]').forEach(function(button){button.addEventListener('click',function(){state.edges=button.dataset.edges;updateControls();writeHash();});});
  document.querySelectorAll('[data-motion]').forEach(function(button){button.addEventListener('click',function(){state.motion=button.dataset.motion;if(state.motion==='tour'){state.playing=true;tourIndex=Math.max(0,tourOrder.indexOf(state.scene));tourDeadline=performance.now()+5000;}updateControls();writeHash();});});
  $('play').addEventListener('click',function(){state.playing=true;initialDriftAt=0;if(state.motion==='tour')tourDeadline=performance.now()+5000;updateControls();writeHash();});$('pause').addEventListener('click',function(){state.playing=false;updateControls();writeHash();});
  $('speed').addEventListener('input',function(){state.speed=Number(this.value)/100;$('speed-output').value=this.value+'%';writeHash();});$('depth').addEventListener('input',function(){state.depth=Number(this.value)-1;$('depth-output').value=this.value;writeHash();});
  $('tilt').addEventListener('input',function(){state.tilt=Number(this.value)*Math.PI/180;state.scene=null;invalidate();writeHash();});
  $('next-octad').addEventListener('click',function(){if(!nextAnimation){state.playing=false;nextAnimation={start:performance.now()};updateControls();}});
  $('dot-size').addEventListener('input',function(){state.dotSize=Number(this.value)/100;$('dot-output').value=state.dotSize.toFixed(1);writeHash();});$('edge-strength').addEventListener('input',function(){state.edgeStrength=Number(this.value)/100;$('edge-output').value=this.value+'%';writeHash();});$('brightness').addEventListener('input',function(){state.brightness=Number(this.value)/100;$('brightness-output').value=state.brightness.toFixed(1);});
  $('zoom-in').addEventListener('click',function(){state.zoom=clamp(state.zoom*1.18,.5,4);invalidate(false);writeHash();});$('zoom-out').addEventListener('click',function(){state.zoom=clamp(state.zoom/1.18,.5,4);invalidate(false);writeHash();});$('reset-view').addEventListener('click',function(){applyScene(state.scene||'petrie',false);});
  $('pile-prev').addEventListener('click',function(){stepPile(-1);});$('pile-next').addEventListener('click',function(){stepPile(1);});
  document.querySelectorAll('.card-head').forEach(function(button){button.addEventListener('click',function(){var card=button.closest('.card');card.classList.toggle('folded');button.setAttribute('aria-expanded',card.classList.contains('folded')?'false':'true');button.querySelector('i').textContent=card.classList.contains('folded')?'+':'−';});});
  $('fullscreen').hidden=!(document.fullscreenEnabled||document.webkitFullscreenEnabled);$('fullscreen').addEventListener('click',function(){var request=document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;if(request)Promise.resolve(request.call(document.documentElement)).catch(function(){});this.blur();});
  document.addEventListener('keydown',function(event){if(/input|select|textarea/i.test(event.target.tagName))return;var key=event.key.toLowerCase();if(key===' '||key==='p'){event.preventDefault();state.playing=!state.playing;updateControls();}else if(key==='r')applyScene(state.scene||'petrie',false);else if(key==='f')$('fullscreen').click();else if(key==='m')switchWindow(state.window===8?24:8);else if(key==='t'&&cloud.supported){state.motion='tour';state.playing=true;tourDeadline=performance.now();updateControls();}else if(key==='escape'){state.selected=-1;if(state.colour==='layers')state.colour='mono';invalidate(false);updateControls();updateDetails();writeHash();}else if(key==='['&&state.selected>=0)stepPile(-1);else if(key===']'&&state.selected>=0)stepPile(1);else if(key==='+'||key==='=')$('zoom-in').click();else if(key==='-')$('zoom-out').click();else if(/^[1-6]$/.test(key)){var featured=scenes.filter(function(scene){return scene.featured;}).sort(function(a,b){return a.featured-b.featured;});if(featured[Number(key)-1])applyScene(featured[Number(key)-1].id,false);}else if(event.key.startsWith('Arrow')){var dx=event.key==='ArrowLeft'?-8:event.key==='ArrowRight'?8:0,dy=event.key==='ArrowUp'?-8:event.key==='ArrowDown'?8:0;Frame.orbit(state.frame,state.depth,dx,dy);state.scene=null;invalidate();}});
  new MutationObserver(function(){buildLegend();buildLayerTable();invalidate(false);}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  addEventListener('resize',resize);

  function orthogonalityError(){var max=0;for(var i=0;i<24;i++)for(var j=0;j<24;j++)max=Math.max(max,Math.abs(Frame.dot(state.frame[i],state.frame[j])-(i===j?1:0)));return max;}
  window.__leechExplorer={
    snapshot:function(){var marker=state.selected>=0?markerPositions().marker:null;return{scene:state.scene||'custom',window:state.window,octad:state.octad,tilt:state.tilt*180/Math.PI,selected:state.selected,selectedScreen:marker,orthogonalityError:orthogonalityError(),renderer:state.renderer,spotCount:state.spotCount,visibleCount:state.visibleCount,spokeCount:state.spokeCount,colour:state.colour,edges:state.edges,zoom:state.zoom,playing:state.playing,motion:state.motion,frame:[Array.from(state.frame[0]),Array.from(state.frame[1])]};},
    advanceTour:function(){tourIndex=(tourIndex+1)%tourOrder.length;applyScene(tourOrder[tourIndex],true,true);return tourOrder[tourIndex];},
    averageDraw:function(){return renderSamples.reduce(function(total,value){return total+value;},0)/Math.max(1,renderSamples.length);},
    loseContext:function(){cloud.loseContext();},
    openScene:function(id){applyScene(id,true);},
    pause:function(){state.playing=false;updateControls();}
  };

  buildSceneButtons();
  if(matchMedia('(max-width: 760px), (max-height: 430px) and (pointer: coarse)').matches){document.querySelectorAll('.card').forEach(function(card){card.classList.add('folded');var button=card.querySelector('.card-head');button.setAttribute('aria-expanded','false');button.querySelector('i').textContent='+';});}
  $('unsupported').hidden=cloud.supported;state.frame=frameForScene(sceneById.get('petrie'),0);restoreHash();if(!new URLSearchParams(location.hash.slice(1)).has('r'))selectDefault();state.defaultSelected=state.selected;resize();updateControls();updateDetails();buildLayerTable();
  setTimeout(function(){if(!reducedMotion&&state.playing)state.playing=true;},2600);
  requestAnimationFrame(loop);
})();
