import Foundation

/// The sounds the TV can play. The names are also the names of the files a family
/// can drop into the server's data/sounds/ folder to replace the built-in ones.
enum SoundCue: String, CaseIterable, Hashable {
    case open        // buzzers open
    case buzz        // someone buzzed in
    case correct
    case wrong
    case timeup
    case tick        // the last five seconds of a countdown
    case reveal      // answer shown, nobody got it
    case dd          // Daily Double
    case finalSting = "final"
    case fanfare     // the winner
    case ding        // Family Feud: a survey answer flips over
    case strike      // Family Feud: the big X
    case strikeout   // Family Feud: the third strike, and the steal that follows
    case faceoff     // Family Feud: a face-off player buzzes in
    case roundstart  // Family Feud: a new round begins
    case winner      // Family Feud: the winning jingle
    case zero        // Family Feud: Fast Money answer worth nothing
    case fmpoints    // Family Feud: Fast Money points are shown
    case fastmoney   // Family Feud: Fast Money is about to begin

    /// Every file name the server may supply: the cues above plus the music tracks.
    static var customNames: Set<String> {
        Set(allCases.map(\.rawValue)).union(["think", "lobby", "feud-lobby"])
    }

    /// Another cue's file to use when the family supplied no file for this one (the third strike
    /// and a Fast Money zero use the strike buzzer).
    var fallbackFile: String? {
        switch self {
        case .strikeout, .zero: return SoundCue.strike.rawValue
        default: return nil
        }
    }
}

enum Wave: Equatable {
    case sine, triangle, square, sawtooth
}

/// One note: a pitch, when it starts, how long it lasts, and optionally a slide to another pitch.
struct ToneSpec: Equatable {
    var frequency: Double
    var start: Double
    var duration: Double
    var wave: Wave = .sine
    var gain: Double = 0.6
    var slideTo: Double? = nil
}

/// Builds the built-in sounds from simple tones, the same recipes the web TV
/// uses (public/audio.js in the gamenight repo), so both displays sound alike and
/// there are no audio files to ship or license.
enum SoundSynth {
    static let sampleRate = 44100

    /// The web TV's master gain is volume × 0.5. Baking the 0.5 in leaves room for
    /// notes that overlap; the player's volume then supplies the rest.
    static let headroom = 0.5

    static func tones(for cue: SoundCue) -> [ToneSpec] {
        switch cue {
        case .open:
            return [ToneSpec(frequency: 880, start: 0, duration: 0.09, wave: .triangle, gain: 0.4)]
        case .buzz:
            return [
                ToneSpec(frequency: 1046, start: 0, duration: 0.14),
                ToneSpec(frequency: 1568, start: 0.09, duration: 0.3),
            ]
        case .correct:
            let notes: [Double] = [523, 659, 784, 1047]
            return notes.enumerated().map { index, note in
                ToneSpec(frequency: note, start: Double(index) * 0.09, duration: index == 3 ? 0.45 : 0.14, wave: .triangle)
            }
        case .wrong:
            return [ToneSpec(frequency: 160, start: 0, duration: 0.55, wave: .square, gain: 0.35, slideTo: 95)]
        case .timeup:
            return [
                ToneSpec(frequency: 330, start: 0, duration: 0.7, wave: .sawtooth, gain: 0.4, slideTo: 220),
                ToneSpec(frequency: 247, start: 0.02, duration: 0.7, wave: .square, gain: 0.25, slideTo: 165),
            ]
        case .tick:
            return [ToneSpec(frequency: 1250, start: 0, duration: 0.035, wave: .square, gain: 0.18)]
        case .reveal:
            return [
                ToneSpec(frequency: 523, start: 0, duration: 0.12, wave: .triangle, gain: 0.4),
                ToneSpec(frequency: 392, start: 0.11, duration: 0.25, wave: .triangle, gain: 0.4),
            ]
        case .dd:
            let notes: [Double] = [392, 523, 659, 784, 1047]
            return notes.enumerated().map { index, note in
                ToneSpec(frequency: note, start: Double(index) * 0.1, duration: index == 4 ? 0.7 : 0.16, wave: .triangle)
            }
        case .finalSting:
            return [
                ToneSpec(frequency: 196, start: 0, duration: 0.9, wave: .triangle),
                ToneSpec(frequency: 294, start: 0.05, duration: 0.9, wave: .triangle, gain: 0.4),
            ]
        case .fanfare:
            let notes: [Double] = [523, 659, 784, 1047, 784, 1047, 1319]
            return notes.enumerated().map { index, note in
                ToneSpec(frequency: note, start: Double(index) * 0.12, duration: index == 6 ? 0.8 : 0.16, wave: .triangle)
            }
        case .ding:
            return [
                ToneSpec(frequency: 1318, start: 0, duration: 0.9, wave: .sine, gain: 0.42),
                ToneSpec(frequency: 1976, start: 0, duration: 0.9, wave: .sine, gain: 0.22),
                ToneSpec(frequency: 2637, start: 0, duration: 0.7, wave: .sine, gain: 0.12),
                ToneSpec(frequency: 660, start: 0, duration: 0.08, wave: .triangle, gain: 0.3),
            ]
        case .strike:
            return strikeTones
        case .strikeout:
            var tones = strikeTones
            tones.append(ToneSpec(frequency: 220, start: 0.85, duration: 0.2, wave: .sawtooth, gain: 0.3))
            tones.append(ToneSpec(frequency: 294, start: 1.05, duration: 0.2, wave: .sawtooth, gain: 0.3))
            tones.append(ToneSpec(frequency: 392, start: 1.25, duration: 0.5, wave: .sawtooth, gain: 0.35, slideTo: 440))
            return tones
        case .faceoff:
            return [
                ToneSpec(frequency: 784, start: 0, duration: 0.08, wave: .square, gain: 0.35),
                ToneSpec(frequency: 1568, start: 0.07, duration: 0.35, wave: .triangle, gain: 0.4),
            ]
        case .roundstart:
            var tones: [ToneSpec] = []
            let run: [(Double, Double)] = [(523, 0), (659, 0.11), (784, 0.22)]
            for (note, start) in run {
                tones.append(ToneSpec(frequency: note, start: start, duration: 0.12, wave: .triangle, gain: 0.45))
            }
            tones.append(ToneSpec(frequency: 1047, start: 0.33, duration: 0.6, wave: .triangle, gain: 0.45))
            tones.append(ToneSpec(frequency: 784, start: 0.33, duration: 0.6, wave: .triangle, gain: 0.3))
            tones.append(ToneSpec(frequency: 659, start: 0.33, duration: 0.6, wave: .triangle, gain: 0.25))
            return tones
        case .winner:
            var tones: [ToneSpec] = []
            let tune: [(Double, Double, Double)] = [(523, 0, 0.14), (659, 0.14, 0.14), (784, 0.28, 0.14), (1047, 0.42, 0.3), (784, 0.76, 0.14), (1047, 0.9, 0.14)]
            for (note, start, length) in tune {
                tones.append(ToneSpec(frequency: note, start: start, duration: length, wave: .triangle, gain: 0.45))
            }
            tones.append(ToneSpec(frequency: 1047, start: 1.06, duration: 0.9, wave: .triangle, gain: 0.4))
            tones.append(ToneSpec(frequency: 784, start: 1.06, duration: 0.9, wave: .triangle, gain: 0.3))
            tones.append(ToneSpec(frequency: 659, start: 1.06, duration: 0.9, wave: .triangle, gain: 0.25))
            return tones
        case .fmpoints:
            return [
                ToneSpec(frequency: 1568, start: 0, duration: 0.18, wave: .triangle, gain: 0.4),
                ToneSpec(frequency: 2093, start: 0.1, duration: 0.55, wave: .triangle, gain: 0.4),
                ToneSpec(frequency: 3136, start: 0.1, duration: 0.4, wave: .sine, gain: 0.12),
            ]
        case .fastmoney:
            var tones: [ToneSpec] = []
            let climb: [(Double, Double)] = [(392, 0), (523, 0.15), (659, 0.3), (784, 0.45)]
            for (note, start) in climb {
                tones.append(ToneSpec(frequency: note, start: start, duration: 0.14, wave: .triangle, gain: 0.45))
            }
            tones.append(ToneSpec(frequency: 1047, start: 0.62, duration: 0.8, wave: .triangle, gain: 0.4))
            tones.append(ToneSpec(frequency: 784, start: 0.62, duration: 0.8, wave: .triangle, gain: 0.3))
            tones.append(ToneSpec(frequency: 659, start: 0.62, duration: 0.8, wave: .triangle, gain: 0.25))
            return tones
        case .zero:
            var tones: [ToneSpec] = []
            let steps: [(Double, Double)] = [(392, 0), (370, 0.2), (349, 0.4)]
            for (note, start) in steps {
                tones.append(ToneSpec(frequency: note, start: start, duration: 0.22, wave: .triangle, gain: 0.4))
            }
            tones.append(ToneSpec(frequency: 294, start: 0.6, duration: 0.5, wave: .triangle, gain: 0.4, slideTo: 233))
            return tones
        }
    }

    /// The Family Feud buzzer: two sawtooth notes a hair apart (they beat against each other) over a low square.
    private static let strikeTones: [ToneSpec] = [
        ToneSpec(frequency: 110, start: 0, duration: 0.8, wave: .sawtooth, gain: 0.45),
        ToneSpec(frequency: 116, start: 0, duration: 0.8, wave: .sawtooth, gain: 0.35),
        ToneSpec(frequency: 55, start: 0, duration: 0.8, wave: .square, gain: 0.2),
    ]

    /// Mono samples between -1 and 1.
    static func render(_ cue: SoundCue, sampleRate: Int = SoundSynth.sampleRate) -> [Float] {
        let tones = tones(for: cue)
        // Each note rings 50 ms past its end, as in the web version.
        let length = tones.map { $0.start + $0.duration + 0.05 }.max() ?? 0
        var mix = [Double](repeating: 0, count: Int((length * Double(sampleRate)).rounded(.up)))
        for tone in tones {
            add(tone, to: &mix, sampleRate: sampleRate)
        }
        return mix.map { Float($0 * headroom) }
    }

    private static func add(_ tone: ToneSpec, to mix: inout [Double], sampleRate: Int) {
        let first = Int((tone.start * Double(sampleRate)).rounded())
        let count = Int((tone.duration * Double(sampleRate)).rounded())
        var phase = 0.0
        for n in 0..<count {
            let index = first + n
            guard index < mix.count else { break }
            let t = Double(n) / Double(sampleRate)
            var frequency = tone.frequency
            if let target = tone.slideTo {
                // An exponential glide from the start pitch to the target over the note.
                frequency = tone.frequency * pow(target / tone.frequency, t / tone.duration)
            }
            phase += 2 * Double.pi * frequency / Double(sampleRate)
            mix[index] += sample(tone.wave, phase: phase) * envelope(t, duration: tone.duration, gain: tone.gain)
        }
    }

    private static func sample(_ wave: Wave, phase: Double) -> Double {
        switch wave {
        case .sine:
            return sin(phase)
        case .triangle:
            return (2 / Double.pi) * asin(sin(phase))
        case .square:
            return sin(phase) >= 0 ? 1 : -1
        case .sawtooth:
            let cycles = phase / (2 * Double.pi)
            return 2 * (cycles - (cycles + 0.5).rounded(.down))
        }
    }

    /// Rises from silence to `gain` in 12 ms, then fades away exponentially by the end of the note.
    static func envelope(_ t: Double, duration: Double, gain: Double) -> Double {
        let silence = 0.0001
        let attack = 0.012
        if t < attack { return silence * pow(gain / silence, t / attack) }
        if t < duration { return gain * pow(silence / gain, (t - attack) / (duration - attack)) }
        return 0
    }

    /// 16-bit mono PCM in a WAV container, which AVAudioPlayer can play straight from memory.
    static func wav(from samples: [Float], sampleRate: Int = SoundSynth.sampleRate) -> Data {
        let byteCount = samples.count * 2
        var data = Data()
        data.reserveCapacity(44 + byteCount)
        data.append(contentsOf: Array("RIFF".utf8))
        append32(UInt32(36 + byteCount), to: &data)
        data.append(contentsOf: Array("WAVE".utf8))
        data.append(contentsOf: Array("fmt ".utf8))
        append32(16, to: &data)                       // size of this block
        append16(1, to: &data)                        // PCM
        append16(1, to: &data)                        // mono
        append32(UInt32(sampleRate), to: &data)
        append32(UInt32(sampleRate * 2), to: &data)   // bytes per second
        append16(2, to: &data)                        // bytes per frame
        append16(16, to: &data)                       // bits per sample
        data.append(contentsOf: Array("data".utf8))
        append32(UInt32(byteCount), to: &data)
        for sample in samples {
            let clipped = max(-1, min(1, sample))
            append16(UInt16(bitPattern: Int16(clipped * 32767)), to: &data)
        }
        return data
    }

    private static func append16(_ value: UInt16, to data: inout Data) {
        data.append(UInt8(value & 0xFF))
        data.append(UInt8(value >> 8))
    }

    private static func append32(_ value: UInt32, to data: inout Data) {
        data.append(UInt8(value & 0xFF))
        data.append(UInt8((value >> 8) & 0xFF))
        data.append(UInt8((value >> 16) & 0xFF))
        data.append(UInt8(value >> 24))
    }
}
