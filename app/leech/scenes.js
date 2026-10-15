/* The 24 named views of the Leech lattice explorer. */
(function (global) {
  'use strict';

  var ROTATIONS = {
    '84A': [
      [0.07176534325183777,0.2505409849362642,0.2272700487089248,0.10827234573640038,0.12387716290409831,-0.08519470143578461,0.005814337208308529,-0.09205316288802394,-0.0296857357379068,0.19324609861465164,-0.1262437980761695,-0.14550609976434228,-0.16835345784547648,-0.21797926715058122,0.19593636995735295,-0.17976494906059776,-0.06706820789857709,0.062910602628851,0.006533433321965205,-0.23920846665651774,0.00506595456893807,0.3173114082582068,0.1681326524095428,-0.6488404137327651],
      [-0.05893988502813167,0.04009668897344549,0.22201840184742594,0.020356778166274892,0.31358332627170665,0.06400565479182034,0.6319433272841173,-0.15371789666159813,-0.058746132029283,-0.018072822380455728,0.07949003384696668,0.20620488880345356,-0.238858908255028,0.24380855961847256,0.04345981528552725,-0.08024150532040451,0.1602823533614098,0.2963760086576766,0.15820434713117493,-0.09511549439055013,0.06787280566110936,-0.0003875414563948281,-0.28465509699407626,0.09549005174374116]
    ],
    '33A': [
      [0.3899609006949899,-0.05239653624118561,0.12891667718870525,0.0975381344229559,0.2679738437290246,-0.03598216458671389,0.02939838963156818,0.06532848318634049,-0.05205602193725982,0.2883707461161976,-0.2348357357008124,0.09521079687987914,0.3484092892345991,0.144405984256877,-0.03188863301543489,-0.09557934796456034,-0.035703577021721875,0.02273835925963243,-0.08522767785584433,0.3125115012510122,-0.3346839186602552,0.11454042728722869,0.05568222335070148,-0.4509855393214766],
      [-0.004325882415169416,-0.2570837664363025,0.3937727692747279,0.12825612948600187,0.4396511458567266,0.45382373835441897,0.12411570411097987,0.02570698219499293,0.24902701386647755,0.047668854544957104,0.24629283014377024,0.08008128599664625,-0.23510980208318538,-0.11580086552579125,0.18017185363776636,-0.16589957110169307,0.010147028474361596,0.043453703363477,0.11294194821030094,0.08517709310568564,0.0697754705307419,0.08996349102449837,0.18711830745041688,0.1306117929053253]
    ],
    '60C': [
      [0.3712376334245693,-0.1567716885782311,0.29767089618947246,0.07766497874681333,0.2286616884076039,-0.08996876219426524,-0.0068681739461397065,-0.18223116408985884,-0.029321622054366295,0.017358806156745565,-0.11067177363563528,-0.21915974977115302,0.05419775907502357,0.14358673330742464,0.26035948964721023,-0.1078810531642391,-0.050496958313443426,-0.13963851542741518,-0.02739423984425649,0.04220496293215787,0.0712741232939763,-0.03255794059387728,0.20482148030723765,-0.6420567383849621],
      [-0.11967296686843076,-0.05486188085993486,0.40363770254236553,-0.03942107915712058,0.10467430608063336,0.12694298639619708,0.4410186862580297,0.09647315953595834,-0.2548759794622098,0.027757279978586374,0.05925186034687955,0.04171980506151302,0.002911123203166635,-0.13379448222805865,-0.05836376470963886,0.0034081929905483495,0.35084831702692937,-0.17673723713721964,0.539063813273028,0.06459623289685686,0.14339048878073485,0.013997076332891937,-0.15853222720398077,0.004704967282742979]
    ],
    '21B': [
      [0.2410578414220165,-0.009177913946841747,0.17094230327388996,-0.014139152478029073,0.2337841510382531,-0.08952462980245743,-0.026757064777925797,0.1698022878315406,0.16267796565633905,0.024391776289030137,-0.1611070214432444,-0.180179358627508,-0.17732511780961133,-0.26152066702899124,-0.06660601177654339,-0.3502060032419888,-0.0091779139468414,-0.00917791394684117,-0.08507842605863478,0.211606983932197,-0.4340794691323615,-0.0011661316397699358,0.11265977052167335,-0.5044475625909667],
      [-0.23715378377614724,-0.11960433220729093,0.19943581327888887,0.39508957907633796,0.5174408863956101,0.18221827315788441,0.3055257979199476,-0.18144446060351757,-0.06477423399239536,-0.060143606354103686,-0.09820027657855662,0.30404692945249,-0.15969183498494316,0.048900266207761216,0.02267216227325793,-0.1081847240530057,-0.1196043322072909,-0.11960433220729087,0.2503558787350447,0.052240992313735975,-0.1420391820367665,0.003175390509580686,-0.1367690521152389,0.15312009046385713]
    ],
    '40A': [
      [0.21231827364245395,0.28884134976023834,0.08862889866912044,0.22760274316571785,0.3004864232675124,-0.04376862372977362,-0.3260936434488617,0.040553020067519215,-0.12376194865944481,-0.2030954884988471,-0.22994370116854368,-0.03718931547586215,-0.15921252090175197,-0.15631305154270836,-0.37665823454145564,-0.0830075220384101,-0.37665823454145586,0.038295005365890936,-0.06843995139832536,-0.1352775736504155,-0.08047058936894463,0.05191386147632428,-0.0775561923217021,-0.3475206627121529],
      [0.025711643840441594,0.20485616109169977,0.2625286638286334,0.17185409556059306,0.4520885819527221,0.21047753772240949,0.3820828827561569,-0.1583766659779901,-0.04443897881600124,0.04363115818042679,0.07107653125568564,0.328922945628039,0.20435246377964641,0.07858246981313564,-0.1537878726870515,0.070081309661379,-0.15378787268705182,-0.060430986878394335,-0.002263394812946537,0.19507863161716213,0.11575298413951386,-0.040388993501144374,-0.16638047719671037,0.370767513306555]
    ],
    '36A': [
      [0.24221037666398582,0.25159098635917615,0.1959576420438333,-0.12750824908852065,0.33267668736706235,-0.1799615220724492,0.0040570261606518235,0.08123196117888815,0.08693841170592206,0.16745254465289375,-0.1209415326854792,-0.3107280096850529,0.05731785725278415,-0.04284544002020717,0.1364476034057248,0.4242916852110879,0.055458348549016684,-0.16928331776133598,0.17638656289853655,0.17909441892347627,0.06992542971003414,0.1790944189234767,-0.14908391145829883,-0.41116128932177226],
      [0.049775207175283935,-0.18780391943498667,0.3025742870762081,-0.2032163990249039,0.3138262083347499,0.0013258609824111235,0.4986523146760555,-0.35453347222339293,0.17545521090025,0.28652355689451275,0.18639720139078403,0.1449743413268022,0.1254032621815056,-0.11725409289816195,-0.3025196768658956,-0.136269760311682,-0.04729928986861176,-0.04614142559408058,-0.06547157986163123,-0.08185838358629362,0.1145908185493939,-0.0818583835862924,-0.09975256285253835,0.05681013680008084]
    ],
    '15D': [
      [0.5956482371197921,-0.10556788762981889,0.2658779392705424,-0.23509657343524373,0.05898306729162438,-0.23509657343524387,0.22906019095480062,0.09054435961635462,-0.0392307210475317,-0.014569083516306926,0.008532701035863474,-0.18733315135184958,0.02264734005507809,0.012263390577871664,-0.23509657343524404,0.11777550896617646,-0.12958445504693936,-0.07977915890528213,-0.26461599170178945,0.12832250747818685,-0.06810506919997285,0.008532701035863203,-0.1190374565349296,-0.3917041281933095],
      [0.038591894267215224,-0.1506221994295431,0.08369329640989447,0.01916476030727944,0.7235528537079637,0.019164760307279358,0.23896355807955774,-0.14603607520700368,-0.14907089148835292,0.15345658007572183,0.10467173831111519,0.2729073901067485,0.27781782599958244,-0.054860335910804074,0.01916476030727961,-0.07472148360000654,-0.0006963873819220308,0.16573144440323026,-0.1376568093035735,0.0546599002756009,0.1465608225124895,0.10467173831111543,0.12868499649368553,0.22444686001245742]
    ],
    '18D': [
      [0.38487474627271856,0,0.21783135028220704,0,0.44964263140094707,-0.11754355299159976,-0.16087542797262497,0,0,0,-0.3848747462727189,-0.5160309154792283,0,0,0,0,0,0,0,0,0,0,0,-0.3848747462727185],
      [-0.2596012942784682,0,0.32294825764688734,0,0.6666226150945294,0.07928412759273852,0.491559378646678,0,0,0,0.2596012942784683,-0.034980284883824306,0,0,0,0,0,0,0,0,0,0,0,0.259601294278468]
    ],
    '14C': [
      [0.2223170377407773,0,0.5126736088055902,0,0.13975168418238526,-0.01923444623449801,0.010530853434994913,0,0,0,-0.4457915875497012,0.05635116782089364,0,0,0,0,0,0,0,0,0,0,0,-0.6825129419225153],
      [-0.13605002932220386,0,0.3127342700397168,0,0.6956748970951527,0.2599317445531787,0.49594709421726313,0,0,0,0.21758740681972674,0.0343745826421806,0,0,0,0,0,0,0,0,0,0,0,0.1940880722466939]
    ],
    '24D': [
      [0.6065657088245012,0,0.28150812515261386,0,0.16252879183589783,-0.16252879183595087,0.16252879183589802,0,0,0,-0.16252879183595084,-0.2815081251526137,0,0,0,0,0,0,0,0,0,0,0,-0.6065657088245013],
      [-0.16252879183589775,0,0.16252879183595073,0,0.6065657088245009,0.2815081251526138,0.6065657088245018,0,0,0,0.2815081251526135,-0.1625287918359508,0,0,0,0,0,0,0,0,0,0,0,0.16252879183589802]
    ],
    '16A': [
      [0.5338947531395212,0,0.1718016575547567,0,0.29563703027422233,0.1718016575547567,0.12716337876610445,0,0,0,-0.7023684046476389,0.1718016575547567,0,0,0,0,0,0,0,0,0,0,0,-0.1718016575547567],
      [-0.03959854696540651,0,0.084236825754059,0,0.4463299213388233,0.084236825754059,0.7899332364483366,0,0,0,0.3832018620749198,0.084236825754059,0,0,0,0,0,0,0,0,0,0,0,-0.084236825754059]
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
      cox7: 'The same 2,641 spots as the opening view, from another of E8\'s Coxeter planes. Each ball sits somewhere else. Switch between the two and watch every ball move.',
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
      rot30: 'A rotation of order 15 turns this plane by 24°. With the central symmetry, the picture is 30-fold, like the opening view, but with 7,861 spots on 165 circles.'
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

    var e8Group='E8 inside Leech · one octad',coxeterGroup='Coxeter planes · one octad';
    var rotationGroup='Rotations · all 24 dimensions',otherGroup='Other views · all 24 dimensions';
    return [
      scene('petrie', 'E8 inside Leech', '30-fold · 2,641 spots', 8, e8('coxeter'),
        { featured: 1, group: e8Group, colour: 'shells', expect: { spots: 2641, symmetry: 30, notSymmetry: 60 } }),
      scene('cox7', 'Coxeter 84°', 'same spots, new places', 8, e8('coxeter7'),
        { group: e8Group, colour: 'shells', expect: { spots: 2641, symmetry: 30, notSymmetry: 60 } }),
      scene('octagonal', 'Octagonal', '8-fold', 8, e8('octagonal'),
        { group: e8Group, colour: 'shells', expect: { spots: 2641, symmetry: 8, notSymmetry: 16 } }),
      scene('squares', 'Squares', '1,821 spots', 8, e8('squares'),
        { featured: 2, group: e8Group, colour: 'shells', expect: { spots: 1821, symmetry: 4 } }),
      scene('e8edges', 'E8 edges', '6,720 edges', 8, e8('coxeter'),
        { group: e8Group, colour: 'shells', weights: [0.25, 0.25, 0.25, 1], edges: 'e8',
          expect: { spots: 2641, symmetry: 30, notSymmetry: 60, edges: 6720 } }),
      scene('weave', 'Weave', 'tilt 4°', 8, e8('coxeter'),
        { group: e8Group, colour: 'shells', tilt: 4 * Math.PI / 180,
          expect: { spots: 70081, symmetry: 2, tilt45Spots: 17665, tilt90Spots: 2641, tilt90Symmetry: 30 } }),
      scene('oct18', 'E7 plane', '18-fold', 8, ROTATIONS['18D'], { group: coxeterGroup, colour: 'shells', expect: { spots: 955, symmetry: 18, notSymmetry: 36, radii: 42, maxRadius: 1.6881 } }),
      scene('oct14', 'D8 plane', '14-fold', 8, ROTATIONS['14C'], { group: coxeterGroup, colour: 'shells', expect: { spots: 1331, symmetry: 14, notSymmetry: 28, radii: 65, maxRadius: 1.6986 } }),
      scene('oct12', 'E6 plane', '12-fold', 8, ROTATIONS['24D'], { group: coxeterGroup, colour: 'shells', expect: { spots: 193, symmetry: 12, notSymmetry: 24, radii: 15, maxRadius: 1.7761 } }),
      scene('oct8', 'D5 plane', '8-fold', 8, ROTATIONS['16A'], { group: coxeterGroup, colour: 'shells', expect: { spots: 193, symmetry: 8, notSymmetry: 16, radii: 20, maxRadius: 1.8478 } }),
      scene('rot84', '84-fold', '196,560 spots', 24, ROTATIONS['84A'], { group: rotationGroup, expect: { spots: 196560, symmetry: 84, notSymmetry: 168, radii: 1290, maxRadius: 1.4637 } }),
      scene('rot66', '66-fold', '172,657 spots', 24, ROTATIONS['33A'], { group: rotationGroup, expect: { spots: 172657, symmetry: 66, notSymmetry: 132, radii: 1366, maxRadius: 1.5251 } }),
      scene('rot60', '60-fold', '70,081 spots', 24, ROTATIONS['60C'], { group: rotationGroup, expect: { spots: 70081, symmetry: 60, notSymmetry: 120, radii: 673, maxRadius: 1.4534 } }),
      scene('cloud23', '46-fold', '191,407 spots', 24, rows23, { featured: 4, group: rotationGroup, colour: 'shapes', expect: { spots: 191407, symmetry: 46, centre: 2 } }),
      scene('rot42', '42-fold', '25,957 spots', 24, ROTATIONS['21B'], { group: rotationGroup, expect: { spots: 25957, symmetry: 42, notSymmetry: 84, radii: 336, maxRadius: 1.4823 } }),
      scene('rot40', '40-fold', '70,081 spots', 24, ROTATIONS['40A'], { group: rotationGroup, expect: { spots: 70081, symmetry: 40, notSymmetry: 80, radii: 881, maxRadius: 1.5120 } }),
      scene('rot36', '36-fold', '47,953 spots', 24, ROTATIONS['36A'], { group: rotationGroup, expect: { spots: 47953, symmetry: 36, notSymmetry: 72, radii: 703, maxRadius: 1.4934 } }),
      scene('rot30', '30-fold', '7,861 spots', 24, ROTATIONS['15D'], { group: rotationGroup, expect: { spots: 7861, symmetry: 30, notSymmetry: 60, radii: 165, maxRadius: 1.5210 } }),
      scene('rosette11', '22-fold', '126,061 spots', 24, symmetricRows11(), { group: rotationGroup, colour: 'shapes', expect: { spots: 126061, symmetry: 22 } }),
      scene('cloud', 'All 196,560', '24 dimensions', 24, randomRows, { featured: 3, group: otherGroup, colour: 'shapes', expect: { spots: 196560, symmetry: 2, maxRadius: 1.6532 } }),
      scene('hexagon', 'Hexagon', '25 spots', 24, hexagonRows, { featured: 5, group: otherGroup, colour: 'shapes', expect: { spots: 25, symmetry: 6, maxRadius: 2 } }),
      scene('coordinates', 'Coordinates', '29 spots', 24, coordinateRows, { group: otherGroup, colour: 'shapes', expect: { spots: 29, symmetry: 4, maxRadius: 2 } }),
      scene('layers', 'Seven layers', 'around one ball', 24, layerRows, { featured: 6, group: otherGroup, colour: 'layers', selected: Leech.FIXED, expect: { spots: 146907, symmetry: 2, xValues: [-2, -1, -0.5, 0, 0.5, 1, 2] } })
    ];
  }

  var LeechScenes = { build: build, ROTATIONS: ROTATIONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = LeechScenes;
  global.LeechScenes = LeechScenes;
})(typeof window === 'undefined' ? globalThis : window);
