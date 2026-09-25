"""Reads sections A and B from an Ableton Live set into sections.json.

python3 read_ableton.py SET.als

The set holds the soundtrack's source material: four MIDI tracks (two drum
kits, bass and piano) with section A in session clip slot 1 and section B in
slot 2, and a custom tuning system. This copies the tempo, the tuning, each
track's level, pan and sends, each drum pad's sample and settings, and every
note of both sections into sections.json,
which compose.py reads. Run it again after editing the set. Read-only: the
set is not changed.
"""
import gzip
import json
import os
import sys
import xml.etree.ElementTree as ET
from fractions import Fraction

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sections.json")
SLOTS = {"A": 0, "B": 1}


def value(el, tag):
    x = el.find(tag)
    return x.get("Value") if x is not None else None


def notes_of(clip):
    out = []
    for kt in clip.findall(".//KeyTracks/KeyTrack"):
        key = int(kt.find("MidiKey").get("Value"))
        for ev in kt.findall("Notes/MidiNoteEvent"):
            if ev.get("IsEnabled", "true") != "true":
                continue
            out.append({"time": round(float(ev.get("Time")), 6), "duration": round(float(ev.get("Duration")), 6),
                        "key": key, "velocity": round(float(ev.get("Velocity")), 3)})
    return sorted(out, key=lambda n: (n["time"], n["key"]))


def main(path):
    ls = ET.fromstring(gzip.open(path).read()).find("LiveSet")
    main_track = ls.find("MainTrack") or ls.find("MasterTrack")
    tempo = float(main_track.find(".//Mixer/Tempo/Manual").get("Value"))

    tuning = ls.find("TuningSystems/TuningSystem")
    ratios = [str(Fraction(int(nt.find(".//Numerator").get("Value")), int(nt.find(".//Denominator").get("Value"))))
              for nt in tuning.findall("NoteTunings/NoteTuning")]
    ref = tuning.find("ReferencePitch")
    names = [s.get("Value") for s in tuning.findall("NoteNames/RemoteableString")]

    tracks = []
    for tr in ls.find("Tracks"):
        if tr.tag != "MidiTrack":
            continue
        name = value(tr.find("Name"), "EffectiveName")
        pads = {}
        rack = tr.find(".//DrumGroupDevice")
        if rack is not None:
            for br in rack.findall(".//DrumBranch"):
                rn = br.find(".//BranchInfo/ReceivingNote")
                simpler = br.find(".//OriginalSimpler")
                if rn is None or simpler is None:
                    continue
                pads[str(128 - int(rn.get("Value")))] = {
                    "name": value(br.find("Name"), "EffectiveName"),
                    "sample": value(simpler.find(".//SampleRef/FileRef"), "RelativePath"),
                    "volume_db": float(value(simpler.find(".//VolumeAndPan/Volume"), "Manual")),
                    "velocity_to_volume": float(value(simpler.find(".//VolumeAndPan/VolumeVelScale"), "Manual"))}
        mixer = tr.find("DeviceChain/Mixer")
        mix = {"volume": float(value(mixer.find("Volume"), "Manual")), "pan": float(value(mixer.find("Pan"), "Manual")),
               "sends": [float(value(h.find("Send"), "Manual")) for h in mixer.findall("Sends/TrackSendHolder")]}
        slots = tr.findall("DeviceChain/MainSequencer/ClipSlotList/ClipSlot")
        sections = {}
        for sec, i in SLOTS.items():
            clip = slots[i].find(".//MidiClip") if i < len(slots) else None
            if clip is None:
                continue
            loop = clip.find("Loop")
            sections[sec] = {"length": float(value(loop, "LoopEnd")) - float(value(loop, "LoopStart")),
                             "notes": notes_of(clip)}
        tracks.append({"name": name, "mixer": mix, "drum_pads": pads, "sections": sections})

    data = {"source": os.path.basename(path), "tempo": tempo,
            "tuning": {"name": value(tuning, "TuningSystemName"), "ratios": ratios, "note_names": names,
                       "reference": {"octave": int(value(ref, "Octave")),
                                     "index": int(value(ref, "NoteIndexWithinOctave")),
                                     "hz": float(value(ref, "FrequencyInHz"))}},
            "tracks": tracks}
    with open(OUT, "w") as f:
        json.dump(data, f, indent=1)
    summary = []
    for t in tracks:
        counts = ", ".join("%s %d notes" % (s, len(v["notes"])) for s, v in t["sections"].items())
        summary.append("%s (%s)" % (t["name"], counts))
    print("wrote %s: tempo %s, tuning %s %s, %s" % (OUT, tempo, data["tuning"]["name"], ratios, ", ".join(summary)))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
