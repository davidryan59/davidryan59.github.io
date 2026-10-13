/* Browser, renderer and interaction checks for the Leech lattice explorer. */
'use strict';

const assert=require('assert'),fs=require('fs'),path=require('path');
const {chromium}=require('../tiling-video/node_modules/playwright-core');
const args=process.argv.slice(2),cloudOnly=args.includes('--cloud');
const url=args.find(value=>!value.startsWith('--'))||'http://127.0.0.1:8000/app/leech/';
const executablePath=process.env.CHROMIUM||undefined;
const renders=path.join(__dirname,'renders'),sceneRenders=path.join(renders,'scenes');

async function snapshot(page){return page.evaluate(()=>window.__leechExplorer.snapshot());}
async function openScene(page,id,wait=750){await page.evaluate(value=>window.__leechExplorer.openScene(value),id);await page.waitForTimeout(wait);return snapshot(page);}

async function cloudMetrics(page){
  return page.evaluate(()=>{
    const source=document.getElementById('cloud'),stage=document.getElementById('stage'),rect=stage.getBoundingClientRect();
    const copy=document.createElement('canvas');copy.width=Math.round(rect.width);copy.height=Math.round(rect.height);
    const context=copy.getContext('2d',{willReadFrequently:true});context.drawImage(source,0,0,copy.width,copy.height);
    const pixels=context.getImageData(0,0,copy.width,copy.height).data,dark=document.documentElement.dataset.theme==='dark';
    const background=dark?[17,19,24]:[246,243,236],cx=copy.width/2,cy=copy.height/2,scale=.2*Math.min(copy.width,copy.height)*window.__leechExplorer.snapshot().zoom;
    let inner=0,innerTotal=0,outer=0,outerTotal=0,sumX=0,sumY=0,lit=0,blue=0;
    for(let y=0;y<copy.height;y+=3)for(let x=0;x<copy.width;x+=3){const at=4*(y*copy.width+x),delta=Math.abs(pixels[at]-background[0])+Math.abs(pixels[at+1]-background[1])+Math.abs(pixels[at+2]-background[2]),r=Math.hypot(x-cx,y-cy)/scale;
      if(r<.4){innerTotal++;if(delta>24)inner++;}if(r>1.5&&r<2.1){outerTotal++;if(delta>24)outer++;}
      if(delta>24){lit++;sumX+=x;sumY+=y;if(pixels[at+2]>pixels[at]+18&&pixels[at+2]>pixels[at+1]+8)blue++;}
    }
    return{innerShare:inner/innerTotal,outerShare:outer/outerTotal,centre:[sumX/lit,sumY/lit],expected:[cx,cy],shorter:Math.min(copy.width,copy.height),blue:blue,lit:lit};
  });
}

async function makeContactSheet(browser,files,target){
  const page=await browser.newPage({viewport:{width:1440,height:920}});
  const images=files.map(file=>'data:image/png;base64,'+fs.readFileSync(file).toString('base64'));
  await page.setContent('<style>html,body{margin:0;background:#111318}main{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px}figure{margin:0;color:#eee;font:13px system-ui}img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;border:1px solid #3b3d43}figcaption{padding:4px}</style><main>'+images.map((src,index)=>'<figure><img src="'+src+'"><figcaption>'+path.basename(files[index],'.png')+'</figcaption></figure>').join('')+'</main>');
  await page.screenshot({path:target,fullPage:true});await page.close();
}

(async()=>{
  fs.mkdirSync(sceneRenders,{recursive:true});
  const browser=await chromium.launch(executablePath?{executablePath}:undefined);
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(url,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__leechExplorer);await page.evaluate(()=>window.__leechExplorer.pause());
  assert.strictEqual(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://drbuild.uk/app/leech/','canonical address');
  assert.strictEqual(await page.title(),'Leech Lattice Explorer','page title');
  const stage=await page.locator('#stage').boundingBox();assert.ok(stage&&stage.width>700&&stage.height>700,'large stage');
  let state=await snapshot(page);assert.strictEqual(state.scene,'petrie','opening scene');assert.strictEqual(state.window,8,'opening window');assert.strictEqual(state.renderer,'spots','opening renderer');assert.strictEqual(state.spotCount,2641,'opening spot count');

  if(!cloudOnly){
    await page.screenshot({path:path.join(renders,'light.png')});await page.click('.theme-toggle');await page.screenshot({path:path.join(renders,'dark.png')});
    const before=await snapshot(page);await page.mouse.move(stage.x+stage.width*.72,stage.y+stage.height*.17);await page.mouse.down();await page.mouse.move(stage.x+stage.width*.72+70,stage.y+stage.height*.17+22,{steps:8});await page.mouse.up();state=await snapshot(page);
    assert.ok(state.orthogonalityError<1e-9,'orbit keeps the frame orthonormal');assert.notDeepStrictEqual(state.frame[0],before.frame[0],'orbit changes the frame');
    const selected=state.selectedScreen;await page.mouse.move(stage.x+selected[0],stage.y+selected[1]);await page.mouse.down();await page.mouse.move(stage.x+selected[0]+60,stage.y+selected[1]+20,{steps:8});await page.mouse.up();const pulled=await snapshot(page);
    assert.ok(pulled.orthogonalityError<1e-9,'pull keeps the frame orthonormal');assert.ok(Math.hypot(pulled.selectedScreen[0]-selected[0],pulled.selectedScreen[1]-selected[1])>30,'selected ball follows a pull');

    for(const id of ['petrie','cox7','cox11','cox13','octagonal','squares','e8edges']){await page.click(`[data-scene="${id}"]`);await page.waitForTimeout(950);assert.match(page.url(),id==='petrie'?/#|\/$/:new RegExp('v='+id),'scene address '+id);}
    await page.click('[data-colour="shapes"]');await page.click('[data-edges="spokes"]');await page.locator('#zoom-in').click();const configured=await snapshot(page),shared=page.url();await page.goto(shared,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__leechExplorer);const restored=await snapshot(page);
    assert.strictEqual(restored.colour,configured.colour,'shared colour');assert.strictEqual(restored.edges,configured.edges,'shared edges');assert.ok(Math.abs(restored.zoom-configured.zoom)<.002,'shared zoom');assert.strictEqual(restored.selected,configured.selected,'shared selection');
    console.log('Canvas drift draw: '+(await page.evaluate(()=>window.__leechExplorer.averageDraw())).toFixed(2)+' ms average');
  }

  state=await openScene(page,'cloud');assert.strictEqual(state.renderer,'cloud','generic cloud renderer');
  let metrics=await cloudMetrics(page);assert.ok(metrics.innerShare>metrics.outerShare*10,'generic cloud is concentrated near the centre');assert.ok(Math.hypot(metrics.centre[0]-metrics.expected[0],metrics.centre[1]-metrics.expected[1])<metrics.shorter*.02,'generic cloud is centred');
  console.log('Generic cloud: centre share '+metrics.innerShare.toFixed(3)+', outer share '+metrics.outerShare.toFixed(4));
  const selectedBefore=state.selected;await page.mouse.click(stage.x+stage.width/2,stage.y+stage.height/2);await page.waitForTimeout(120);state=await snapshot(page);assert.notStrictEqual(state.selected,selectedBefore,'cloud tap selects the nearest ball');await page.click('[data-edges="spokes"]');await page.waitForTimeout(120);assert.strictEqual((await snapshot(page)).spokeCount,4600,'selected cloud ball has 4,600 spokes');await page.click('[data-edges="none"]');
  const blueBefore=metrics.blue;await page.click('#legend .legend-row:nth-child(2)');await page.waitForTimeout(150);metrics=await cloudMetrics(page);assert.ok(metrics.blue<blueBefore*.5,'hiding shape B removes blue pixels');await page.click('#legend .legend-row:nth-child(2)');
  state=await openScene(page,'layers');assert.strictEqual(state.renderer,'cloud','layers cloud renderer');
  state=await openScene(page,'rings23');assert.strictEqual(state.renderer,'discs','shape filter uses sparse discs');assert.strictEqual(state.visibleCount,1104,'shape filter count');
  state=await openScene(page,'sunburst');assert.strictEqual(state.renderer,'discs','sunburst uses sparse discs');assert.strictEqual(state.visibleCount,4601,'sunburst visible count');assert.strictEqual(state.spokeCount,4600,'sunburst spoke count');
  state=await openScene(page,'hexagon');assert.strictEqual(state.renderer,'spots','hexagon crystallises');assert.strictEqual(state.spotCount,25,'hexagon spot count');
  state=await openScene(page,'coordinates');assert.strictEqual(state.spotCount,29,'coordinate spot count');
  await openScene(page,'petrie');await page.locator('#tilt').fill('90');await page.waitForTimeout(750);state=await snapshot(page);assert.strictEqual(state.spotCount,2641,'90-degree tilt crystallises to 2,641 spots');
  await openScene(page,'petrie');await page.click('#next-octad');await page.waitForTimeout(4400);state=await snapshot(page);assert.strictEqual(state.octad,1,'Next E8 changes octad');assert.ok(state.tilt<1e-8,'Next E8 clears tilt');assert.strictEqual(state.spotCount,2641,'Next E8 spot count');

  const visited=[];await openScene(page,'petrie');for(let i=1;i<14;i++)visited.push(await page.evaluate(()=>window.__leechExplorer.advanceTour()));assert.deepStrictEqual(visited,tourExpected(),'tour order');
  function tourExpected(){return['cox7','octagonal','squares','e8edges','weave','cloud','hexagon','coordinates','layers','rings23','sunburst','rosette11','cloud23'];}

  const sceneFiles=[];if(await page.evaluate(()=>document.documentElement.dataset.theme!=='dark'))await page.click('.theme-toggle');
  for(const id of ['petrie','cox7','cox11','cox13','octagonal','squares','e8edges','weave','cloud','hexagon','coordinates','layers','rings23','cloud23','sunburst','rosette11']){await openScene(page,id);const file=path.join(sceneRenders,id+'.png');await page.screenshot({path:file});sceneFiles.push(file);}
  await makeContactSheet(browser,sceneFiles,path.join(renders,'scenes-sheet.png'));

  await openScene(page,'cloud');const canvas=await page.locator('#overlay').boundingBox();await page.mouse.move(canvas.x+canvas.width*.7,canvas.y+canvas.height*.72);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width*.7+48,canvas.y+canvas.height*.72+18,{steps:6});await page.mouse.up();await page.waitForTimeout(180);assert.match(page.url(),/[#&]p=/,'free view address');const free=await snapshot(page),freeUrl=page.url();await page.goto(freeUrl,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__leechExplorer);const freeRestored=await snapshot(page);assert.strictEqual(freeRestored.window,24,'free 24D window reload');assert.ok(freeRestored.orthogonalityError<1e-7,'free 24D frame reload');assert.ok(Math.abs(freeRestored.frame[0][0]-free.frame[0][0])<1/32767+.0001,'free row reload');

  await page.evaluate(()=>window.__leechExplorer.loseContext());await page.waitForTimeout(1000);assert.strictEqual((await snapshot(page)).renderer,'cloud','cloud returns after context restore');
  console.log('WebGL draw loop: '+(await page.evaluate(()=>window.__leechExplorer.averageDraw())).toFixed(2)+' ms average');
  assert.deepStrictEqual(errors,[],'browser errors');await browser.close();
  console.log('Leech browser checks passed: Canvas spots, WebGL cloud, selection, tilt, tour, address and context restore.');
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
