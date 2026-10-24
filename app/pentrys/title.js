/* The title's letters: "Pentrys" in Anton, as outlines, so the game draws its
   title without loading a font. Draw.logo in draw.js lays them out.

   Anton is Copyright 2020 The Anton Project Authors
   (https://github.com/googlefonts/AntonFont.git). These outlines are taken
   from Anton-Regular.ttf by tools/pentrys/title.py and are licensed under the
   SIL Open Font License 1.1, in anton-OFL.txt beside this file.

   Each outline is in font units, 2048 to the em, y down, with its baseline at 0
   and its origin at the left of its advance. adv is the advance width, top the
   height above the baseline and bottom the depth below it. Anton has no
   kerning between these letters, so each starts where the last one's advance
   ends. */
(function (root) {
  'use strict';
  var Pentrys = root.Pentrys || (root.Pentrys = {});

  Pentrys.Title = {
    UPM: 2048,
    GLYPHS: {
      P: { adv: 967, top: 1760, bottom: 0,
        d: 'M78 0V-1760H543Q689 -1760 774.5 -1695Q860 -1630 897 -1510Q934 -1390 934 -1224Q934 -1064 903 -945.5Q872 -827 792.5 -762Q713 -697 567 -697H424V0ZM424 -1013H444Q542 -1013 564 -1068Q586 -1123 586 -1230Q586 -1330 564.5 -1384.5Q543 -1439 463 -1439H424Z' },
      e: { adv: 1000, top: 1516, bottom: 16,
        d: 'M492 16Q332 16 237 -44Q142 -104 101 -217Q60 -330 60 -489V-1092Q60 -1301 180 -1408.5Q300 -1516 510 -1516Q942 -1516 942 -1092V-983Q942 -785 938 -717H418V-427Q418 -387 423 -348.5Q428 -310 445.5 -285Q463 -260 502 -260Q558 -260 572 -308.5Q586 -357 586 -435V-579H942V-494Q942 -326 900.5 -212.5Q859 -99 760.5 -41.5Q662 16 492 16ZM416 -895H586V-1097Q586 -1178 566 -1213.5Q546 -1249 506 -1249Q463 -1249 439.5 -1215Q416 -1181 416 -1097Z' },
      n: { adv: 1021, top: 1516, bottom: 0,
        d: 'M72 0V-1500H430V-1309Q450 -1395 504.5 -1455.5Q559 -1516 656 -1516Q812 -1516 882.5 -1420Q953 -1324 953 -1157V0H600V-1120Q600 -1164 582 -1201.5Q564 -1239 520 -1239Q479 -1239 459.5 -1210.5Q440 -1182 435 -1139.5Q430 -1097 430 -1055V0Z' },
      t: { adv: 625, top: 1760, bottom: 16,
        d: 'M380 16Q235 16 184.5 -45.5Q134 -107 134 -234V-1169H33V-1442H134V-1760H482V-1442H583V-1169H482V-318Q482 -281 494 -266Q506 -251 540 -251Q564 -251 583 -255V-11Q571 -7 508 4.5Q445 16 380 16Z' },
      r: { adv: 710, top: 1518, bottom: 0,
        d: 'M72 0V-1500H436V-1333Q462 -1420 528 -1469Q594 -1518 694 -1518V-1219Q650 -1219 589 -1209.5Q528 -1200 482 -1183.5Q436 -1167 436 -1147V0Z' },
      y: { adv: 944, top: 1500, bottom: 250,
        d: 'M43 250V23H215Q254 23 254 -4Q254 -18 251 -33L16 -1500H359L459 -396L577 -1500H922L644 78Q629 163 586.5 206.5Q544 250 447 250Z' },
      s: { adv: 972, top: 1516, bottom: 16,
        d: 'M483 16Q39 16 39 -434V-553H399V-377Q399 -326 419 -297Q439 -268 483 -268Q561 -268 561 -385Q561 -483 520 -531.5Q479 -580 420 -625L229 -772Q139 -842 92 -920Q45 -998 45 -1137Q45 -1266 106.5 -1350Q168 -1434 269.5 -1475Q371 -1516 489 -1516Q925 -1516 925 -1081V-1053H555V-1110Q555 -1155 539.5 -1197Q524 -1239 479 -1239Q403 -1239 403 -1159Q403 -1078 467 -1032L689 -870Q793 -795 863.5 -692Q934 -589 934 -418Q934 -206 813.5 -95Q693 16 483 16Z' }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
