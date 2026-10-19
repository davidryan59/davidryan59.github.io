/* Browser, renderer and interaction checks for the Leech lattice explorer. */
'use strict';

const assert=require('assert'),fs=require('fs'),path=require('path');
const {chromium}=require('../tiling-video/node_modules/playwright-core');
const args=process.argv.slice(2),cloudOnly=args.includes('--cloud');
const url=args.find(value=>!value.startsWith('--'))||'http://127.0.0.1:8000/app/leech/';
const executablePath=process.env.CHROMIUM||undefined;
const renders=path.join(__dirname,'renders'),sceneRenders=path.join(renders,'scenes');

async function snapshot(page){return page.evaluate(()=>window.__leechExplorer.snapshot());}
async function clickScene(page,id){const group=await page.locator(`[data-scene="${id}"]`).getAttribute('data-group');const heading=page.locator('.scene-group-heading').filter({hasText:group});if(await heading.getAttribute('aria-expanded')!=='true')await heading.click();await page.click(`[data-scene="${id}"]`);}
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
  await page.setContent('<style>html,body{margin:0;background:#111318}main{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px}figure{min-width:0;margin:0;color:#eee;font:13px system-ui}img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;border:1px solid #3b3d43}figcaption{padding:4px}</style><main>'+images.map((src,index)=>'<figure><img src="'+src+'"><figcaption>'+path.basename(files[index],'.png').replace(/-density$/,'')+'</figcaption></figure>').join('')+'</main>');
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
  assert.strictEqual(await page.locator('meta[property="og:image"]').getAttribute('content'),'https://drbuild.uk/social/leech.jpg','sharing card');assert.strictEqual(await page.locator('meta[name="twitter:card"]').getAttribute('content'),'summary_large_image','large Twitter card');assert.ok(await page.locator('meta[name="twitter:image:alt"]').getAttribute('content'),'card alt text');
  const stage=await page.locator('#stage').boundingBox();assert.ok(stage&&stage.width>700&&stage.height>700,'large stage');
  let state=await snapshot(page);assert.strictEqual(state.scene,'rot36','opening scene');assert.strictEqual(state.window,24,'opening window');assert.strictEqual(state.playing,false,'opening view is paused');assert.strictEqual(state.colour,'shapes','opening colour');
  await page.waitForTimeout(600);assert.match(await page.locator('#renderer-status').textContent(),/^47,953 spots/,'opening status counts spots at rest');
  for(const heading of await page.locator('.scene-group-heading').all()){const box=await heading.boundingBox(),body=await page.locator('.show-card .card-body').boundingBox();assert.ok(box&&box.y>=body.y&&box.y+box.height<=body.y+body.height+1,'group heading in view: '+await heading.textContent());}
  {const heading=page.locator('.scene-group-heading').first(),before=await heading.getAttribute('aria-expanded');await heading.click();assert.notStrictEqual(await heading.getAttribute('aria-expanded'),before,'group heading toggles');await heading.click();assert.strictEqual(await heading.getAttribute('aria-expanded'),before,'group heading toggles back');}
  assert.strictEqual(await page.locator('.scene-button .sub em').count(),23,'every scene button shows a spot count');assert.strictEqual(await page.locator('[data-scene="rot60"] .sub em').textContent(),'70,081','60-fold spot count');
  assert.strictEqual((await snapshot(page)).transitioning,false,'no transition at load');assert.strictEqual(await page.locator('#change-output').textContent(),'3 s','scene change defaults to 3 s');
  assert.strictEqual(state.points,'raw','raw points are the default');
  assert.strictEqual(await page.locator('.show-card [data-window]').count(),0,'Show card has no dimensions control');
  assert.strictEqual(await page.locator('.options-card [data-window]').count(),2,'Options card owns the dimensions control');
  assert.strictEqual(await page.locator('.scene-button small').count(),12,'twelve Density glow markers');

  if(!cloudOnly){
    await openScene(page,'petrie');await page.screenshot({path:path.join(renders,'light.png')});await page.click('.theme-toggle');await page.screenshot({path:path.join(renders,'dark.png')});
    const before=await snapshot(page);await page.mouse.move(stage.x+stage.width*.72,stage.y+stage.height*.17);await page.mouse.down();await page.mouse.move(stage.x+stage.width*.72+70,stage.y+stage.height*.17+22,{steps:8});await page.mouse.up();state=await snapshot(page);
    assert.ok(state.orthogonalityError<1e-9,'orbit keeps the frame orthonormal');assert.notDeepStrictEqual(state.frame[0],before.frame[0],'orbit changes the frame');
    assert.strictEqual(state.selected,-1,'no ball selected at first');await page.evaluate(()=>window.__leechExplorer.selectOuter());state=await snapshot(page);
    const selected=state.selectedScreen;await page.mouse.move(stage.x+selected[0],stage.y+selected[1]);await page.mouse.down();await page.mouse.move(stage.x+selected[0]+60,stage.y+selected[1]+20,{steps:8});await page.mouse.up();const pulled=await snapshot(page);
    assert.ok(pulled.orthogonalityError<1e-9,'pull keeps the frame orthonormal');assert.ok(Math.hypot(pulled.selectedScreen[0]-selected[0],pulled.selectedScreen[1]-selected[1])>30,'selected ball follows a pull');

    for(const id of ['petrie','cox7','octagonal','squares','e8edges','oct18','oct14','oct12','oct8']){await clickScene(page,id);await page.waitForTimeout(1100);assert.match(page.url(),new RegExp('v='+id),'scene address '+id);}
    await page.click('[data-colour="shapes"]');await page.click('[data-edges="spokes"]');await page.locator('#zoom-in').click();await page.waitForTimeout(200);const configured=await snapshot(page),shared=page.url();await page.goto(shared,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__leechExplorer);const restored=await snapshot(page);
    assert.strictEqual(restored.colour,configured.colour,'shared colour');assert.strictEqual(restored.edges,configured.edges,'shared edges');assert.ok(Math.abs(restored.zoom-configured.zoom)<.002,'shared zoom');assert.strictEqual(restored.selected,configured.selected,'shared selection');

    await openScene(page,'petrie');await page.locator('#zoom-in').click();await page.locator('#zoom-in').click();const zoomed=(await snapshot(page)).zoom;await clickScene(page,'squares');await page.waitForTimeout(1100);assert.ok(Math.abs((await snapshot(page)).zoom-zoomed)<1e-9,'scene change keeps a user zoom');await page.click('#reset-view');await page.waitForTimeout(3200);assert.ok(Math.abs((await snapshot(page)).zoom-.95)<1e-6,'Reset restores the scene zoom');
    await page.locator('#change-time').fill('0');await clickScene(page,'octagonal');assert.strictEqual((await snapshot(page)).transitioning,false,'zero-second scene change is immediate');await page.locator('#change-time').fill('6');await clickScene(page,'squares');await page.waitForTimeout(1000);assert.strictEqual((await snapshot(page)).transitioning,true,'three-second scene change is still running after one second');await openScene(page,'petrie');
    await page.click('.options-card [data-window="24"]');assert.strictEqual((await snapshot(page)).window,24,'Options switches to all 24 dimensions');await page.click('.options-card [data-window="8"]');assert.strictEqual((await snapshot(page)).window,8,'Options switches to one octad');
    console.log('Canvas drift draw: '+(await page.evaluate(()=>window.__leechExplorer.averageDraw())).toFixed(2)+' ms average');
  }

  // Phase 6c: Spin, Drift, Step, pan, hide and Rings.
  const residual=(row,plane)=>{const a=plane[0],b=plane[1],da=row.reduce((t,v,i)=>t+v*a[i],0),db=row.reduce((t,v,i)=>t+v*b[i],0);return Math.sqrt(row.reduce((t,v,i)=>t+(v-da*a[i]-db*b[i])**2,0));};
  await openScene(page,'rot36');const plane36=(await snapshot(page)).frame;
  await page.click('[data-motion="spin"]');await page.waitForTimeout(1000);state=await snapshot(page);await page.click('#pause');
  assert.strictEqual(state.scene,'rot36','Spin keeps the scene');assert.ok(Math.max(residual(state.frame[0],plane36),residual(state.frame[1],plane36))<1e-9,'Spin keeps the plane');assert.ok(Math.abs(state.frame[0][0]-plane36[0][0])>1e-6,'Spin turns the picture');
  await page.click('[data-motion="drift"]');await page.waitForTimeout(1000);state=await snapshot(page);await page.click('#pause');
  assert.strictEqual(state.scene,'custom','Drift leaves the scene');assert.match(state.title,/^Drifting from 36-fold/,'Drift title');assert.strictEqual(await page.locator('[data-scene="rot36"].left').count(),1,'left scene keeps an outline');
  await openScene(page,'rot36');const before36=(await snapshot(page)).frame;await page.click('#step');await page.waitForTimeout(3400);state=await snapshot(page);
  {const angle=Math.PI/18,c=Math.cos(angle),sn=Math.sin(angle),expected=[before36[0].map((v,i)=>c*v+sn*before36[1][i]),before36[1].map((v,i)=>-sn*before36[0][i]+c*v)];let error=0;for(let r=0;r<2;r++)for(let k=0;k<24;k++)error=Math.max(error,Math.abs(state.frame[r][k]-expected[r][k]));assert.ok(error<1e-9,'Step rolls the frame by exactly 10 degrees');}
  assert.strictEqual(state.scene,'rot36','Step keeps the scene');assert.strictEqual(state.status,'Turned by 10°: every spot landed on a spot','Step status');
  await page.mouse.move(stage.x+stage.width/2,stage.y+stage.height/2);await page.mouse.wheel(0,-Math.log(4/state.zoom)/.001);await page.waitForTimeout(200);assert.ok(Math.abs((await snapshot(page)).zoom-4)<.01,'zoom 4');
  await page.keyboard.down('Shift');await page.mouse.down();await page.mouse.move(stage.x+stage.width/2+90,stage.y+stage.height/2+40,{steps:6});await page.mouse.up();await page.keyboard.up('Shift');await page.waitForTimeout(200);state=await snapshot(page);
  assert.ok(Math.hypot(state.pan[0],state.pan[1])>.05,'Shift-drag pans');assert.strictEqual(state.scene,'rot36','pan keeps the scene');assert.match(page.url(),/[#&]pan=/,'pan address');
  await page.click('#reset-view');await page.waitForTimeout(3400);state=await snapshot(page);assert.deepStrictEqual(state.pan,[0,0],'Reset clears pan');assert.doesNotMatch(page.url(),/pan=/,'Reset clears the pan address');
  await page.waitForTimeout(400);await page.mouse.click(stage.x+stage.width/2+70,stage.y+stage.height/2+30);state=await snapshot(page);assert.ok(state.selected>=0,'clicking a ball selects it');
  await page.mouse.move(stage.x+state.selectedScreen[0],stage.y+state.selectedScreen[1]);await page.waitForTimeout(500);state=await snapshot(page);
  assert.match(state.status,/^47,953 spots/,'hover and selection keep the full picture visible');assert.strictEqual(await page.locator('#cloud').evaluate(element=>element.style.opacity),'1','hover keeps the cloud at full opacity');await page.click('#clear-selection');
  await page.keyboard.press('h');await page.waitForTimeout(200);state=await snapshot(page);assert.strictEqual(state.uiHidden,true,'H hides the controls');
  for(const selector of ['.topbar','.show-card','.options-card','.look-card','.stage-status','.results'])assert.strictEqual(await page.locator(selector).isVisible(),false,'hidden: '+selector);
  assert.match(page.url(),/[#&]ui=0/,'hidden controls address');await page.screenshot({path:path.join(renders,'hidden.png')});
  await page.keyboard.press('h');await page.waitForTimeout(200);assert.strictEqual((await snapshot(page)).uiHidden,false,'H shows the controls');assert.ok(await page.locator('.topbar').isVisible(),'controls return');
  if(await page.evaluate(()=>document.documentElement.dataset.theme==='dark'))await page.click('.theme-toggle');
  await openScene(page,'rot36');await page.click('[data-colour="rings"]');await page.waitForTimeout(400);const bands36=await page.evaluate(()=>window.__leechExplorer.bands());
  fs.mkdirSync(path.join(renders,'review'),{recursive:true});await page.screenshot({path:path.join(renders,'review','colours-light.png')});
  await clickScene(page,'rot60');await page.waitForTimeout(3400);const bands60=await page.evaluate(()=>window.__leechExplorer.bands());
  assert.strictEqual((await snapshot(page)).colour,'rings','Rings survives a scene change');assert.strictEqual(bands60.hash,bands36.hash,'each ball keeps its band from rot36');
  assert.strictEqual(bands60.counts.reduce((a,b)=>a+b,0),196560,'band counts sum to 196,560');assert.strictEqual(bands60.legend.reduce((a,b)=>a+Number(b.replace(/,/g,'')),0),196560,'legend counts sum to 196,560');
  await page.click('[data-colour="shapes"]');

  await page.click('[data-points="density"]');await page.waitForTimeout(120);state=await snapshot(page);assert.strictEqual(state.points,'density','Density control');assert.match(page.url(),/[#&]g=1/,'Density address');const densityUrl=page.url();await page.goto(densityUrl,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__leechExplorer);assert.strictEqual((await snapshot(page)).points,'density','Density survives reload');

  const root=url.split('#')[0];await page.goto(root+'#v=cox11');await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__leechExplorer);assert.strictEqual((await snapshot(page)).scene,'cox7','cox11 retired address');await page.goto(root+'#v=sunburst');await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__leechExplorer);assert.strictEqual((await snapshot(page)).scene,'layers','sunburst retired address');

  state=await openScene(page,'cloud');assert.strictEqual(state.renderer,'cloud','generic cloud renderer');
  let metrics=await cloudMetrics(page);assert.ok(metrics.innerShare>metrics.outerShare*10,'generic cloud is concentrated near the centre');assert.ok(Math.hypot(metrics.centre[0]-metrics.expected[0],metrics.centre[1]-metrics.expected[1])<metrics.shorter*.02,'generic cloud is centred');
  console.log('Generic cloud: centre share '+metrics.innerShare.toFixed(3)+', outer share '+metrics.outerShare.toFixed(4));
  const selectedBefore=state.selected;await page.mouse.click(stage.x+stage.width/2,stage.y+stage.height/2);await page.waitForTimeout(120);state=await snapshot(page);assert.notStrictEqual(state.selected,selectedBefore,'cloud tap selects the nearest ball');await page.click('[data-edges="spokes"]');await page.waitForTimeout(120);assert.strictEqual((await snapshot(page)).spokeCount,4600,'selected cloud ball has 4,600 spokes');await page.click('[data-edges="none"]');await page.click('#clear-selection');
  await page.click('[data-colour="shapes"]');await page.waitForTimeout(150);metrics=await cloudMetrics(page);const blueBefore=metrics.blue;await page.click('#legend .legend-row:nth-child(2)');await page.waitForTimeout(150);metrics=await cloudMetrics(page);assert.ok(metrics.blue<blueBefore*.5,'hiding shape B removes blue pixels');await page.click('#legend .legend-row:nth-child(2)');
  state=await openScene(page,'layers');assert.strictEqual(state.renderer,'cloud','layers cloud renderer');
  state=await openScene(page,'hexagon');assert.strictEqual(state.renderer,'spots','hexagon crystallises');assert.strictEqual(state.spotCount,25,'hexagon spot count');
  state=await openScene(page,'coordinates');assert.strictEqual(state.spotCount,29,'coordinate spot count');
  await openScene(page,'petrie');await page.locator('#tilt').fill('90');await page.waitForTimeout(750);state=await snapshot(page);assert.strictEqual(state.spotCount,2641,'90-degree tilt crystallises to 2,641 spots');
  await openScene(page,'petrie');await page.click('#next-octad');await page.waitForTimeout(4400);state=await snapshot(page);assert.strictEqual(state.octad,1,'Next E8 changes octad');assert.ok(state.tilt<1e-8,'Next E8 clears tilt');assert.strictEqual(state.spotCount,2641,'Next E8 spot count');

  const visited=[];await openScene(page,'petrie');for(let i=1;i<23;i++)visited.push(await page.evaluate(()=>window.__leechExplorer.advanceTour()));assert.deepStrictEqual(visited,tourExpected().slice(1),'tour order');
  function tourExpected(){return['petrie','cox7','octagonal','squares','e8edges','weave','oct18','oct14','oct12','oct8','rot84','rot66','rot60','cloud23','rot42','rot40','rot36','rot30','rosette11','cloud','hexagon','coordinates','layers'];}

  const sceneFiles=[],densityFiles=[];if(await page.evaluate(()=>document.documentElement.dataset.theme!=='dark'))await page.click('.theme-toggle');await page.click('[data-points="raw"]');
  for(const id of tourExpected()){await openScene(page,id);const file=path.join(sceneRenders,id+'.png');await page.screenshot({path:file});sceneFiles.push(file);}
  await makeContactSheet(browser,sceneFiles,path.join(renders,'scenes-sheet.png'));
  await page.click('[data-points="density"]');for(const id of tourExpected()){await openScene(page,id);const file=path.join(sceneRenders,id+'-density.png');await page.screenshot({path:file});densityFiles.push(file);}await makeContactSheet(browser,densityFiles,path.join(renders,'scenes-density-sheet.png'));

  await openScene(page,'cloud');const canvas=await page.locator('#overlay').boundingBox();await page.mouse.move(canvas.x+canvas.width*.7,canvas.y+canvas.height*.72);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width*.7+48,canvas.y+canvas.height*.72+18,{steps:6});await page.mouse.up();await page.waitForTimeout(180);assert.match(page.url(),/[#&]p=/,'free view address');const free=await snapshot(page),freeUrl=page.url();await page.goto(freeUrl,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__leechExplorer);const freeRestored=await snapshot(page);assert.strictEqual(freeRestored.window,24,'free 24D window reload');assert.ok(freeRestored.orthogonalityError<1e-7,'free 24D frame reload');assert.ok(Math.abs(freeRestored.frame[0][0]-free.frame[0][0])<1/32767+.0001,'free row reload');

  await page.evaluate(()=>window.__leechExplorer.loseContext());await page.waitForTimeout(1000);assert.strictEqual((await snapshot(page)).renderer,'cloud','cloud returns after context restore');
  console.log('WebGL draw loop: '+(await page.evaluate(()=>window.__leechExplorer.averageDraw())).toFixed(2)+' ms average');
  assert.deepStrictEqual(errors,[],'browser errors');await browser.close();
  console.log('Leech browser checks passed: Canvas spots, WebGL cloud, selection, tilt, tour, Spin, Step, pan, hidden controls, Rings, address and context restore.');
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
