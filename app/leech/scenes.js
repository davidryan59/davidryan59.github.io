/* The 24 named views of the Leech lattice explorer. */
(function (global) {
  'use strict';

  var ROTATIONS = {
    '84A': [
      [0.017850090306331057,0.19311034929323798,0.2049003820659614,-0.0009912807103544547,0.2301386978000144,-0.32959414064314674,0.09296117739109874,0.017949614288048883,0.34414796129499137,0.14223206363361074,-0.00650204168142299,-0.13089632901186532,-0.1100482527395954,-0.33107358975668677,0.33571488595056315,0.014439510938411206,0.14221898173398184,-0.13466201140381914,0.005525862979919963,0.29533865620686456,0.1040780290091343,0.1741617801626021,-0.0319596823165885,-0.4376822664730581],
      [-0.06392095224610139,-0.055649604561238256,0.3191854004739025,-0.28475991068182377,0.23544398192857943,-0.14108580653260758,0.000930979271123141,-0.3195452577450538,0.010540989189402298,0.35784030398059763,0.13048114661698673,0.24046731002946112,0.15740642814987987,0.10219818152734612,-0.32996694248523745,-0.1185226238685132,0.02315406111582156,0.22296999393887648,0.4019021296496428,-0.14816801055370538,0.07151490047238625,0.17157689202626616,0.004864271690647545,-0.054179452717052136]
    ],
    '33A': [
      [0.2681471417542199,0.007274896446086014,0.149222701794428,-0.07589267180393601,0.35617724011354995,-0.05820319165623353,-0.09161926739654037,0.10694737620638642,-0.055567007476811876,0.13077590366111705,-0.2742688443588899,-0.32899022364034064,0.06705547579436151,-0.35736324624298715,0.03492518744493929,0.18292321681274795,-0.08047392075766643,-0.30644707631489615,0.19352838039266573,-0.07133865191575249,-0.04708724747064317,0.24600364158365054,-0.36311329670659137,-0.2046637336817131],
      [0.1559039784884283,-0.22092348208847376,0.28584555793028626,-0.5051969222472613,0.11240789967553924,-0.16953476023511704,-0.06737236438901652,-0.24790050184948523,0.055857160875806625,0.2012128977867761,-0.09245208804271635,0.14784944562753324,0.24822364122870802,0.14782162855319658,-0.3729295163641909,-0.024115689075145892,0.14809309243836918,0.09346336821420864,-0.19610240901536627,0.0019484111557177184,0.32940826154977226,-0.006501731259478594,-0.04051517121611126,0.07826694742400975]
    ],
    '60C': [
      [0.12448212189485407,0.061339608599555596,0.17749074424126382,0.01489302360146025,0.30881215664264694,0.05902480613213025,-0.042680410945692165,0.10333286853196828,0.19049803008811653,0.3402386911302279,-0.0782510521667909,-0.020682428700497406,0.139869456822708,0.24004961992918156,0.08819107778846182,0.5350676573678352,-0.0812997184907569,-0.10140055379705616,0.058676754418567297,0.16381470144445553,0.4452143538398148,0.08346979291766393,-0.16878789801098104,-0.16419863134615847],
      [-0.0004719404589662983,0.17917966550488618,0.21805774381490708,0.11894337677673951,0.05582897626702055,0.008302458652316828,0.5643553716985004,-0.13349210256303587,-0.0023561198675391168,0.06288608810636627,0.09681319245863511,-0.04310025891938222,0.18933034202060536,-0.15181866129797963,-0.4481208047526254,-0.01835246334040674,-0.010002790796264089,-0.15995570575393048,-0.2197857444187785,-0.3047651072711531,-0.009626053211996197,0.08603558973662863,-0.0029100946341298053,-0.3421746849806984]
    ],
    '21B': [
      [0.24864861906021066,-0.2655714754691106,0.09102680207057373,0.020952986235483903,0.49231149750542386,-0.2599346497119518,0.017935047708592014,0.16013993624322093,0.2475205553442321,-0.020952986235483948,0.21854218371024686,-0.05638564770630273,0.17162073455625343,-0.07078868039167259,0.3557340167231829,0.14253199293963495,0.2706809113954708,-0.10271066294087178,0.13307375415387548,0.15729445064389405,0.014063683613617806,0.13180739392763258,-0.18139240588191166,-0.22869939275222806],
      [-0.030853214200322776,0.16817812021893003,0.29255301268143824,-0.18766681572043573,0.19186856632729637,0.1319372988616601,0.45416871468165826,-0.3897682938813738,0.2090560374364646,0.1876668157204362,0.13418711770373246,-0.05515521999376009,0.03557021290591461,0.14098806670666011,-0.16099489250115737,-0.1687566572070925,0.021115323336852895,-0.3310732869170985,-0.30346473432011317,0.21539106991004656,0.0015702092458119807,-0.03414348067356113,0.0870819921524171,-0.06888341412350528]
    ],
    '40A': [
      [0.05425388604182232,-0.006482630687149091,0.3539801480817556,-0.04584446197356978,0.21324705569813893,-0.054081784059547756,-0.18948375210663385,-0.09641163249160545,0.07834339693699996,0.24644100010300052,0.005205195083911991,-0.3288791327991369,-0.09641163249160549,0.14494486386406946,-0.09641163249160556,0.4009758711500246,0.10071299783805486,-0.19411390744228174,0.28034683191115534,0.33742558705172676,-0.0400200945455623,0.38647427800963713,-0.09641163249160556,-0.006246658586112519],
      [0.2655383000390762,-0.1639817992747773,0.17709913083043513,0.023248706891160417,0.2294262234911552,0.24061210692823978,0.480570476344091,-0.024524345478954716,-0.07176684595939573,0.29938376732186406,0.4583615650222874,0.019096233845125585,-0.024524345478955184,0.1666104228078981,-0.024524345478955104,-0.27236338408882593,0.10500239247954782,-0.1586506749382476,-0.07334794660795407,0.06668209192873792,0.1573294851402673,-0.12614117305447262,-0.024524345478955118,-0.18150030428430589]
    ],
    '36A': [
      [0.24221037666398582,0.25159098635917615,0.1959576420438333,-0.12750824908852065,0.33267668736706235,-0.1799615220724492,0.0040570261606518235,0.08123196117888815,0.08693841170592206,0.16745254465289375,-0.1209415326854792,-0.3107280096850529,0.05731785725278415,-0.04284544002020717,0.1364476034057248,0.4242916852110879,0.055458348549016684,-0.16928331776133598,0.17638656289853655,0.17909441892347627,0.06992542971003414,0.1790944189234767,-0.14908391145829883,-0.41116128932177226],
      [0.049775207175283935,-0.18780391943498667,0.3025742870762081,-0.2032163990249039,0.3138262083347499,0.0013258609824111235,0.4986523146760555,-0.35453347222339293,0.17545521090025,0.28652355689451275,0.18639720139078403,0.1449743413268022,0.1254032621815056,-0.11725409289816195,-0.3025196768658956,-0.136269760311682,-0.04729928986861176,-0.04614142559408058,-0.06547157986163123,-0.08185838358629362,0.1145908185493939,-0.0818583835862924,-0.09975256285253835,0.05681013680008084]
    ],
    '15D': [
      [0.12884225246240455,0.0625174693680205,0.044798283975156936,-0.04479828397515666,0.21354902013237842,-0.361100629413545,0.16490157981547485,0.0909462840701269,-0.05770923807005988,-0.04503971349166496,-0.2409661398448829,-0.04479828397515679,-0.039958956207512206,-0.21090036826335515,-0.02434887773089091,0.21090036826335537,-0.09877648088087604,-0.14261568989981827,0.08129872500452173,0.044947495622246196,0.15223205523708105,0.27236654480574224,-0.4460992991127226,-0.5218719571129272],
      [-0.23473722221958618,-0.23272491658240158,0.22946893766568377,-0.22946893766568366,0.18821388024406507,-0.04702398815074719,0.354983833374353,-0.38974785517622706,-0.056228936566560056,0.36135348930520766,0.002154117620589452,-0.22946893766568371,-0.06996664408730188,-0.10091538171615567,-0.2794236673691818,0.10091538171615574,0.1316677228828411,0.009483822864167784,-0.2602962956056473,-0.1356794035180298,-0.06259859249741465,-0.013420486726078238,0.2443628570671587,-0.11283713961945625]
    ],
    '18D': [
      [0.30400692126979934,0,0.1704036707846644,0,0.5949981564429216,0.008214265646463433,-0.0555183361920156,0,0,0,-0.24287771154132148,-0.3291768914809036,0,0,0,0,0,0,0,0,0,0,0,-0.5949981564429215],
      [0.18552550522756792,0,0.47900534944601336,0,0.04658541542229655,-0.10491422845268296,0.7090911905277831,0,0,0,0.44664745947025886,0.13595034161360384,0,0,0,0,0,0,0,0,0,0,0,-0.04658541542229669]
    ],
    '14C': [
      [0.5144449354150287,0,0.20728941634583645,0,0.4005323477164995,-6.028518363465823e-17,-0.027009726169976735,0,0,0,-0.2559592611652729,-0.4342129253524544,0,0,0,0,0,0,0,0,0,0,0,-0.5264653944015241],
      [0.14512303104646151,0,0.4926919763759993,0,0.35396062513646176,2.1370424237821948e-16,0.5338396392237174,0,0,0,0.4692538144096576,0.31172651663140466,0,0,0,0,0,0,0,0,0,0,0,0.09245795915946536]
    ],
    '24D': [
      [0.442828486328979,0,0.29143588726152386,0,0.44282848632897903,-0.008771869799766779,-0.05670225774045099,0,0,0,-0.3569100148017415,-0.4428284863289797,0,0,0,0,0,0,0,0,0,0,0,-0.4428284863289793],
      [0.03273706377010889,0,0.4667936802993214,0,0.03273706377010863,0.1186555352973465,0.767001437360612,0,0,0,0.4188632923586375,-0.032737063770109216,0,0,0,0,0,0,0,0,0,0,0,-0.03273706377010893]
    ],
    '16A': [
      [0.4230273835462393,0,0.4230273835462393,0,0.4230273835462393,-0.06651936049699615,-0.08721176175394886,0,0,0,-0.28392799854311873,-0.4376591207940637,0,0,0,0,0,0,0,0,0,0,0,-0.4230273835462393],
      [0.18556988014853368,0,0.18556988014853368,0,0.18556988014853368,-0.3246692651516545,0.6751166241917692,0,0,0,0.1709381429007096,0.5213855019408246,0,0,0,0,0,0,0,0,0,0,0,-0.18556988014853368]
    ]
  };

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var value = Math.imul(seed ^ seed >>> 15, 1 | seed);
      value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function vector(data, index) {
    return new Float64Array(data.coords.slice(index * 24, index * 24 + 24));
  }

  function symmetricRows23() {
    var row0 = new Float64Array(24), row1 = new Float64Array(24);
    var scale = Math.sqrt(2 / 23);
    for (var i = 0; i < 23; i++) {
      row0[i] = scale * Math.cos(2 * Math.PI * i / 23);
      row1[i] = scale * Math.sin(2 * Math.PI * i / 23);
    }
    return [row0, row1];
  }

  function symmetricRows11() {
    var row0 = new Float64Array(24), row1 = new Float64Array(24);
    var powers = [1, 2, 4, 8, 16, 9, 18, 13, 3, 6, 12];
    for (var j = 0; j < 11; j++) {
      var cosine = Math.cos(2 * Math.PI * j / 11) / Math.sqrt(11);
      var sine = Math.sin(2 * Math.PI * j / 11) / Math.sqrt(11);
      row0[powers[j]] = row0[23 - powers[j]] = cosine;
      row1[powers[j]] = row1[23 - powers[j]] = sine;
    }
    return [row0, row1];
  }

  function build(options) {
    var Leech = options.Leech, Frame = options.Frame, E8 = options.E8, data = options.data;
    var octad = Leech.TRIO[0], presets = E8.makePresets();
    function e8(name) { return Frame.place(presets[name], octad); }
    var rows23 = symmetricRows23();

    var random = mulberry32(24), randomRows = [new Float64Array(24), new Float64Array(24)];
    for (var r = 0; r < 2; r++) for (var k = 0; k < 24; k++) randomRows[r][k] = random() - 0.5;
    randomRows = Frame.orthonormalise(randomRows);

    var hexagonRows = Frame.orthonormalise([vector(data, 0), vector(data, 6)]);
    var coordinateRows = [new Float64Array(24), new Float64Array(24)];
    coordinateRows[0][0] = 1; coordinateRows[1][1] = 1;
    var layerRow = vector(data, Leech.FIXED);
    for (var i = 0; i < 24; i++) layerRow[i] /= Math.sqrt(32);
    var layerRows = Frame.orthonormalise([layerRow, rows23[0]]);

    var captions = {
      petrie: 'Seen through one octad, all 196,560 balls fall on 2,641 spots. The 240 gold dots are a copy of E8, one ball each.',
      cox7: 'The same 2,641 spots as E8 inside Leech, from another of E8\'s Coxeter planes. Each ball sits somewhere else. Switch between the two and watch every ball move.',
      octagonal: "E8's octagonal view of the same octad, with eight-fold symmetry.",
      squares: "E8's squares view of the same octad. Some spots merge here, so 1,821 remain.",
      e8edges: 'The 240 gold balls touch each other in 6,720 pairs. These are the edges of the E8 picture, inside the Leech lattice.',
      weave: 'The octad view tilted 4° toward the next octad. Each pile spreads into a small cloud, and 2,641 spots become 70,081.',
      cloud: 'A view that mixes all 24 coordinates. The 196,560 balls average into a smooth glow, as most views in high dimensions do.',
      hexagon: 'The first three coordinates, seen along the diagonal (1, −1, 1). All 196,560 balls land on 25 spots.',
      coordinates: 'The first two coordinates alone. All 196,560 balls land on 29 spots.',
      layers: 'The horizontal axis points at one ball. The others stand in seven layers by their angle from it.',
      cloud23: 'The 23-cycle of M24 turns this plane by a 23rd of a turn. With the central symmetry, the picture is 46-fold. The symmetry is exact, but 8,546 rings of 23 merge into a glow.',
      rosette11: 'A plane turned by i → 2i, which cycles 22 coordinates in two loops of 11. The picture has 22-fold symmetry.',
      oct18: "Inside one octad, a rotation of the lattice turns this plane by 20°. It is E7's Coxeter plane: 955 spots on 42 circles.",
      oct14: "Inside one octad, a rotation turns this plane by a fourteenth of a turn. It is D8's Coxeter plane: 1,331 spots on 65 circles.",
      oct12: "Inside one octad, a rotation turns this plane by 30°. It is E6's Coxeter plane: 193 spots on 15 circles.",
      oct8: "Inside one octad, a rotation turns this plane by 45°. It is D5's Coxeter plane: 193 spots on 20 circles.",
      rot84: "The lattice's rotation of highest order, 84, turns this plane by an 84th of a turn. Every ball lands on its own spot, so the picture is a glow with exact 84-fold symmetry.",
      rot66: 'A rotation of order 33 turns this plane. With the central symmetry, the picture is 66-fold: 172,657 spots on 1,366 circles.',
      rot60: 'A rotation of order 60 turns this plane by 6°. 70,081 spots lie on 673 circles.',
      rot42: 'A rotation of order 21 turns this plane. With the central symmetry, the picture is 42-fold: 25,957 spots on 336 circles.',
      rot40: 'A rotation of order 40 turns this plane by 9°. 70,081 spots lie on 881 circles.',
      rot36: 'A rotation of order 36 turns this plane by 10°. 47,953 spots lie on 703 circles.',
      rot30: 'A rotation of order 15 turns this plane by 24°. With the central symmetry, the picture is 30-fold, like E8 inside Leech, but with 7,861 spots on 165 circles.'
    };

    function scene(id, label, sub, windowSize, rows, settings) {
      settings = settings || {};
      var result = {
        id: id, label: label, sub: sub, caption: captions[id], featured: settings.featured || 0, group: settings.group,
        window: windowSize, octad: settings.octad === undefined ? 0 : settings.octad,
        rows: rows.map(function (row) { return new Float64Array(row); }), tilt: settings.tilt || 0,
        colour: settings.colour || 'shapes',
        edges: settings.edges || 'none', selected: settings.selected === undefined ? null : settings.selected,
        expect: settings.expect
      };
      if (settings.weights) result.weights = settings.weights.slice();
      return result;
    }

    var e8Group='E8 inside Leech · one octad';
    var rotationGroup='Rotations · all 24 dimensions',otherGroup='Other views';
    return [
      scene('petrie', 'E8 inside Leech', '30-fold', 8, e8('coxeter'),
        { featured: 1, group: e8Group, colour: 'shells', expect: { spots: 2641, symmetry: 30, notSymmetry: 60 } }),
      scene('cox7', 'Coxeter 84°', 'new places', 8, e8('coxeter7'),
        { group: e8Group, colour: 'shells', expect: { spots: 2641, symmetry: 30, notSymmetry: 60 } }),
      scene('octagonal', 'Octagonal', '8-fold', 8, e8('octagonal'),
        { group: e8Group, colour: 'shells', expect: { spots: 2641, symmetry: 8, notSymmetry: 16 } }),
      scene('squares', 'Squares', '4-fold', 8, e8('squares'),
        { featured: 2, group: e8Group, colour: 'shells', expect: { spots: 1821, symmetry: 4 } }),
      scene('e8edges', 'E8 edges', '6,720 edges', 8, e8('coxeter'),
        { group: e8Group, colour: 'shells', weights: [0.25, 0.25, 0.25, 1], edges: 'e8',
          expect: { spots: 2641, symmetry: 30, notSymmetry: 60, edges: 6720 } }),
      scene('weave', 'Weave', 'tilt 4°', 8, e8('coxeter'),
        { group: e8Group, colour: 'shells', tilt: 4 * Math.PI / 180,
          expect: { spots: 70081, symmetry: 2, tilt45Spots: 17665, tilt90Spots: 2641, tilt90Symmetry: 30 } }),
      scene('rot84', '84-fold', '', 24, ROTATIONS['84A'], { group: rotationGroup, expect: { spots: 196560, symmetry: 84, notSymmetry: 168, radii: 1290, maxRadius: 1.4637 } }),
      scene('rot66', '66-fold', '', 24, ROTATIONS['33A'], { group: rotationGroup, expect: { spots: 172657, symmetry: 66, notSymmetry: 132, radii: 1366, maxRadius: 1.5251 } }),
      scene('rot60', '60-fold', '', 24, ROTATIONS['60C'], { group: rotationGroup, expect: { spots: 70081, symmetry: 60, notSymmetry: 120, radii: 673, maxRadius: 1.4534 } }),
      scene('cloud23', '46-fold', '', 24, rows23, { featured: 4, group: rotationGroup, colour: 'shapes', expect: { spots: 191407, symmetry: 46, centre: 2 } }),
      scene('rot42', '42-fold', '', 24, ROTATIONS['21B'], { group: rotationGroup, expect: { spots: 25957, symmetry: 42, notSymmetry: 84, radii: 336, maxRadius: 1.4823 } }),
      scene('rot40', '40-fold', '', 24, ROTATIONS['40A'], { group: rotationGroup, expect: { spots: 70081, symmetry: 40, notSymmetry: 80, radii: 881, maxRadius: 1.5120 } }),
      scene('rot36', '36-fold', '', 24, ROTATIONS['36A'], { group: rotationGroup, expect: { spots: 47953, symmetry: 36, notSymmetry: 72, radii: 703, maxRadius: 1.4934 } }),
      scene('rot30', '30-fold', '', 24, ROTATIONS['15D'], { group: rotationGroup, expect: { spots: 7861, symmetry: 30, notSymmetry: 60, radii: 165, maxRadius: 1.5210 } }),
      scene('rosette11', '22-fold', '', 24, symmetricRows11(), { group: rotationGroup, colour: 'shapes', expect: { spots: 126061, symmetry: 22 } }),
      scene('cloud', 'All 196,560', 'generic', 24, randomRows, { featured: 3, group: otherGroup, colour: 'shapes', expect: { spots: 196560, symmetry: 2, maxRadius: 1.6532 } }),
      scene('hexagon', 'Hexagon', '6-fold', 24, hexagonRows, { featured: 5, group: otherGroup, colour: 'shapes', expect: { spots: 25, symmetry: 6, maxRadius: 2 } }),
      scene('coordinates', 'Coordinates', '4-fold', 24, coordinateRows, { group: otherGroup, colour: 'shapes', expect: { spots: 29, symmetry: 4, maxRadius: 2 } }),
      scene('layers', 'Seven layers', 'one ball', 24, layerRows, { featured: 6, group: otherGroup, colour: 'layers', selected: Leech.FIXED, expect: { spots: 146907, symmetry: 2, xValues: [-2, -1, -0.5, 0, 0.5, 1, 2] } }),
      scene('oct18', 'E7 Coxeter', '18-fold', 8, ROTATIONS['18D'], { group: otherGroup, colour: 'shells', expect: { spots: 955, symmetry: 18, notSymmetry: 36, radii: 42, maxRadius: 1.6881 } }),
      scene('oct14', 'D8 Coxeter', '14-fold', 8, ROTATIONS['14C'], { group: otherGroup, colour: 'shells', expect: { spots: 1331, symmetry: 14, notSymmetry: 28, radii: 65, maxRadius: 1.6986 } }),
      scene('oct12', 'E6 Coxeter', '12-fold', 8, ROTATIONS['24D'], { group: otherGroup, colour: 'shells', expect: { spots: 193, symmetry: 12, notSymmetry: 24, radii: 15, maxRadius: 1.7761 } }),
      scene('oct8', 'D5 Coxeter', '8-fold', 8, ROTATIONS['16A'], { group: otherGroup, colour: 'shells', expect: { spots: 193, symmetry: 8, notSymmetry: 16, radii: 20, maxRadius: 1.8478 } })
    ];
  }

  var LeechScenes = { build: build, ROTATIONS: ROTATIONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = LeechScenes;
  global.LeechScenes = LeechScenes;
})(typeof window === 'undefined' ? globalThis : window);
