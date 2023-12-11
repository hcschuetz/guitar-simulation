import makeNoteDisplay from "./note-display.js";


const TAU = 2*Math.PI;

const ctx = new AudioContext();

document.getElementById("resumeAudio").addEventListener("click", () => ctx.resume());

// Prevent the output from overshooting in Chrome:
const almostDestination = new GainNode(ctx, {gain: 0.25});
almostDestination.connect(ctx.destination);


class StringNode extends AudioWorkletNode {
  constructor(ctx, {basePitch, amplitude = 1, onSilent} = {}) {
    super(ctx, "string");
    this.baseFreq = 440 * 2**((basePitch+3-60)/12);
    this.amplitude = amplitude;
    this.basePitch = basePitch;
    this.currentFret = -1;

    this.port.onmessage = ({data}) => {
      if (data.type = "silent" && onSilent) {
        onSilent();
      }
    };
  }

  pick(fret = 0) {
    if (fret === this.currentFret) {
      // Upon the following events
      // - press key #1
      // - press key #2
      // - release key #1 (still holding key #2 down)
      // Chrome creates (after a while) another keydown event for key #2 that
      // is not marked as "repeat".  (Could we recognize such keydown events
      // in some easy way?)
      // So this situation is detected here (in some hacky way) and the event
      // is ignored.
      return;
    }
    const fretFreq = this.baseFreq * 2**(fret/12);
    const nHarmonics = Math.min(15, Math.floor(4000/fretFreq));
    const stiffnesses = new Float32Array(nHarmonics);
    const decayRates = new Float32Array(nHarmonics);
    const vals = new Float32Array(nHarmonics);
    const {sampleRate} = this.context;
    for (let i = 0; i < nHarmonics; i++) {
      const harmonic = i+1;
      const freq = fretFreq * harmonic;
      // stiffnesses are computed according to the physical model
      stiffnesses[i] = 2 - 2*Math.cos(TAU * freq / sampleRate);
      // absFriction and relVal are manually "designed"
      const absFriction = 4 * (fretFreq/1000)*harmonic**1.5;
      decayRates[i] = Math.exp(-(absFriction / sampleRate));
      const relVal = (2000/fretFreq)**1.5 * (harmonic%2 ? 1 : 2) / harmonic**2;
      vals[i] = this.amplitude * relVal;
    }
    this.port.postMessage({type: "pick", stiffnesses, decayRates, vals});
    this.currentFret = fret;
  }

  damp() {
    this.port.postMessage({type: "damp"});
    this.currentFret = -1;
  }

  stop() {
    this.port.postMessage({type: "stop"});
    this.currentFret = -1;
  }
}

async function setupStrings() {
  const pitchDisplays = [..."ebgd"].map(c => {
    const box = document.getElementById(`${c}-string`);
    const textBox = document.createElement("div");
    textBox.setAttribute("class", "note-text")
    box.append(textBox);
    const svgBox = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgBox.setAttribute("class", "note-svg");
    box.append(svgBox);
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "note-display");
    g.setAttribute("transform", "translate(25, 35) scale(10,10)");
    svgBox.append(g);
    const noteDisplay = makeNoteDisplay(g);

    function set(pitch) {
      textBox.innerHTML = pitch2note(pitch);
      // Guitar notes are written an octave higher than they sound.
      noteDisplay.display(pitch + 12);
    }

    function clear() {
      textBox.innerHTML = "";
      noteDisplay.clear();
    }

    return {set, clear};
  });

  //                     e4  b3  g3  d3
  const stringPitches = [64, 59, 55, 50];

  await ctx.resume();
  await ctx.audioWorklet.addModule("StringWorklet.js")

  const stringNodes = stringPitches.map((basePitch, i) => {
    const node = new StringNode(ctx, {
      basePitch,
      onSilent: () => { pitchDisplays[i].clear(); },
    });
    node.connect(almostDestination);
    return node;
  });

  const keyMap = {};
  `
    Backquote, Digit1, Digit2, Digit3, Digit4, Digit5, Digit6, Digit7, Digit8, Digit9, Digit0, Minus, Equal, Backspace
    Tab, KeyQ, KeyW, KeyE, KeyR, KeyT, KeyY, KeyU, KeyI, KeyO, KeyP, BracketLeft, BracketRight, Backslash
    CapsLock, KeyA, KeyS, KeyD, KeyF, KeyG, KeyH, KeyJ, KeyK, KeyL, Semicolon, Quote, Enter
    ShiftLeft, KeyZ, KeyX, KeyC, KeyV, KeyB, KeyN, KeyM, Comma, Period, Slash, ShiftRight
  `.trim().split(/\n\r?|\r/).map((line, row) =>
    // ".splice(1)" removes the special keys Backquote/Tab/CapsLock/ShiftLeft
    line.split(",").splice(1).forEach((field, col) => {
      keyMap[field.trim()] = {row, col};
    })
  );

  // TODO make enharmonic name choices (e.g. d# vs. eb) configurable
  const noteNames = "c c♯ d d♯ e f f♯ g g♯ a b♭ b".split(" ");
  const pitch2note = pitch =>
    `${noteNames[pitch % 12]}<sub>${Math.floor(pitch / 12) - 1}</sub>`;

  window.addEventListener("keydown", (ev) => {
    if (ev.repeat || ev.altKey || ev.ctrlKey || ev.metaKey) return;

    const keyPos = keyMap[ev.code];
    if (!keyPos) return;
    ev.preventDefault();
    const node = stringNodes[keyPos.row];
    const fret = keyPos.col;
    node.pick(fret);
    pitchDisplays[keyPos.row].set(node.basePitch + fret);
  });

  window.addEventListener("keyup", ev => {
    const keyPos = keyMap[ev.code];
    if (!keyPos) return;
    const {row, col} = keyPos;
    const node = stringNodes[row];
    if (node.currentFret !== col) return;
    node.damp();
  });
}

setupStrings();
