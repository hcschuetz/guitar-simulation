// Emit the sum of multiple decaying sine waves to the given channel.
// The numeric arrays vals/speeds/stiffnesses/decayRates should have equal lengths.
// Each index i corresponds to one wave.
// vals[i]        The current displacement.  Input/output.
// speeds[i]      The current displacement change per sample.  Input/output.
// stiffnesses[i] A proportionality factor between displacement and
//                (negative) acceleration.  Input.
//                This parameter mostly determines the frequency of the wave.
// decayRates[i]  Factor by which the speed is reduced over one sampling step.
//                Input.  Typically slightly smaller than 1.
function oscillate(channel, {vals, speeds, stiffnesses, decayRates}) {
  const nPartials = vals.length;
  const nSamples = channel.length;
  let energy = 0;
  for (let j = 0; j < nPartials; j++) {
    const decayRate = decayRates[j];
    const stiffness = stiffnesses[j];
    let speed = speeds[j];
    let val = vals[j];
    for (let i = 0; i < nSamples; i++) {
      channel[i] += speed;
      val += speed;
      speed *= decayRate;
      speed -= stiffness * val;
    }
    speeds[j] = speed;
    vals[j] = val;
    energy += speed*speed + stiffness * val * val;
  }
  return energy;
}

const empty = new Float32Array(0);

const silence = {
  vals: empty,
  speeds: empty,
  stiffnesses: empty,
  decayRates: empty,
};

class StringProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [];
  }

  // for terminating completely (not restartable):
  stopped = false;

  // used to notify the audio node when this string ends sounding.
  silent = true;

  // data for the oscillators
  state = silence;

  // When transitioning from one sound to another or from/to silence,
  // we simply interpolate linearly between the old and new sound over some
  // amount of time.  lambda is the current interpolation parameter.
  // lambda is the fraction of the old sound and
  // 1 - lambda is the fraction of the new sound.
  // When lambda reaches 0, we stop simulating the old sound.
  lambda = 0;

  // support ramping up/down the volume to avoid click sounds
  old_state = silence;

  // buffer for the old sound;
  fading = new Float32Array(0);

  constructor(options) {
    super(options);

    const transitionTo = (state) => {
      this.old_state = this.state;
      this.state = state;
      this.lambda = 1;
    }

    this.port.onmessage = ({data}) => {
      switch (data.type) {
        case "pick": {
          const {vals, stiffnesses, decayRates} = data;
          const speeds = data.vals.map(() => 0);
          transitionTo({vals, speeds, stiffnesses, decayRates});
          this.silent = false;
          break;
        }
        case "damp": {
          transitionTo(silence);
          break;
        }
        case "stop": {
          this.stopped = true;
          break;
        }
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
    if (this.silent) return true;

    const out00 = outputs[0][0];
    const nSamples = out00.length;

    let energy = oscillate(out00, this.state);

    let {lambda} = this;
    if (lambda !== 0) {
      let fading = this.fading;
      if (fading.length < nSamples) {
        this.fading = fading = new Float32Array(nSamples);
      }
      this.fading.fill(0);
      const fading_energy =
        oscillate(fading, this.old_state);

      for (let i = 0; i < nSamples; i++) {
        lambda -= 1e-3; // TODO parameterize
        if (lambda <= 0) {
          lambda = 0;
          this.old_state = silence;
          break;
        }
        out00[i] = (1-lambda) * out00[i] + lambda * fading[i];
      }
      // actually an overestimation:
      energy += lambda * fading_energy;
      this.lambda = lambda;
    }

    if (energy < 1e-10) { // TODO get limit as parameter
      this.port.postMessage({type: "silent"});
      this.silent = true;
    }

    return true;
  }
}

registerProcessor('string', StringProcessor);
