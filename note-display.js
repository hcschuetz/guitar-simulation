
const svgEl = (name, attrs = {}) => {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

const octaveNoteMapping = [
  {lineOffset: 0.0},
  {lineOffset: 0.0, sign: "♯"},
  {lineOffset: 0.5},
  {lineOffset: 0.5, sign: "♯"},
  {lineOffset: 1.0},
  {lineOffset: 1.5},
  {lineOffset: 1.5, sign: "♯"},
  {lineOffset: 2.0},
  {lineOffset: 2.0, sign: "♯"},
  {lineOffset: 2.5},
  {lineOffset: 3.0, sign: "♭"},
  {lineOffset: 3.0},
];

// How far down must the signs be moved so that they "apply" to a note on
// the baseline?
// TODO make sure that a font is used for which these numbers are appropriate
const signOffset = {
  "♭": 0.4,
  "♯": 0.75,
}

// Paint a short 5-line staff into the provided (SVG) parent element
// and return methods for painting/clearing a single note into these
// note lines.
// A note is given as an integer MIDI pitch.  It is positioned in the staff
// assuming a treble clef.
// Most notes outside the C-major scale are displayed as sharp versions of the
// next lower semitone.  The exception is the semitone between a and b, which
// is displayed as b-flat instead of a-sharp.
export default function makeNoteDisplay(parent) {
  const lineProps = {"stroke-width": .1, stroke: "black"};

  for (let i = 0; i < 5; i++) {
    parent.append(svgEl("line", {...lineProps, x1: -2, y1: i, x2: 2, y2: i}));
  }

  let currentNote = null;

  function clear() {
    if (currentNote) {
      currentNote.remove();
      currentNote = null;
    }
  }

  function display(pitch) {
    clear();
    currentNote = svgEl("g");
    parent.append(currentNote);

    const inOctave = pitch % 12;
    const octave = (pitch - inOctave) / 12;
    const note = octaveNoteMapping[inOctave];
    const lineOffset = 22.5 - octave * 3.5 - note.lineOffset;
    currentNote.append(svgEl("circle", {
      cx: 0.5,
      cy: lineOffset + 0.1,
      r: 0.5,
      transform: "skewY(-10) scale(1.2, 1)",
    }));
    if (note.sign) {
      const text = svgEl("text", {
        x: -1.7,
        y: lineOffset + signOffset[note.sign],
        "font-size": 2.5,
      });
      text.append(note.sign);
      currentNote.append(text)
    }
    for (let i = -1; i >= lineOffset; i--) {
      currentNote.append(svgEl("line", {...lineProps, x1: -0.4, y1: i, x2: 1.5, y2: i}));
    }
    for (let i =  5; i <= lineOffset; i++) {
      currentNote.append(svgEl("line", {...lineProps, x1: -0.4, y1: i, x2: 1.5, y2: i}));
    }
  }
  return {clear, display};
}
