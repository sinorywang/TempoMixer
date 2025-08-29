import { PitchShifter } from './soundtouch.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // 2. Get HTML elements
    const audioFileInput = document.getElementById('audio-file');
    const playButton = document.getElementById('play-button');
    const stopButton = document.getElementById('stop-button');
    
    const speedSlider = document.getElementById('speed-slider');
    const speedInput = document.getElementById('speed-input');
    
    const volumeSlider = document.getElementById('volume-slider');
    const volumeInput = document.getElementById('volume-input');

    const lowpassToggle = document.getElementById('lowpass-toggle');
    const frequencySlider = document.getElementById('frequency-slider');
    const frequencyInput = document.getElementById('frequency-input');
    const qSlider = document.getElementById('q-slider');
    const qInput = document.getElementById('q-input');

    const recordingIndicator = document.getElementById('recording-indicator');
    const recordedAudioContainer = document.getElementById('recorded-audio-container');

    // 3. Global variables
    let audioBuffer = null;
    let shifter = null;
    let gainNode = audioContext.createGain();
    
    const lowpassFilter = audioContext.createBiquadFilter();
    lowpassFilter.type = 'lowpass';

    let mediaRecorder = null;
    let recordedChunks = [];
    
    let speedIntervalId = null; // [NEW] Variable to hold our speed change timer

    // --- Helper function to manage audio connections ---
    function connectAudioPath() {
        if (!shifter) return;

        shifter.node.disconnect();
        lowpassFilter.disconnect();

        if (lowpassToggle.checked) {
            shifter.node.connect(lowpassFilter);
            lowpassFilter.connect(gainNode);
        } else {
            shifter.node.connect(gainNode);
        }
    }

    // 4. File loading and decoding
    audioFileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (shifter) {
            shifter.disconnect();
            shifter = null;
        }
        stopButton.disabled = true;
        playButton.disabled = true;
        recordedAudioContainer.innerHTML = '';

        const arrayBuffer = await file.arrayBuffer();
        audioContext.decodeAudioData(arrayBuffer, (buffer) => {
            audioBuffer = buffer;
            playButton.disabled = false;
        }, (e) => {
            alert('Failed to decode audio file: ' + e.err);
        });
    });

    // 5. Play and Record Logic
    playButton.addEventListener('click', async () => {
        if (!audioBuffer) return;
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        shifter = new PitchShifter(audioContext, audioBuffer, 4096);
        
        connectAudioPath(); 

        shifter.on('end', () => {
            if (!stopButton.disabled) {
                stopButton.click();
            }
        });
        
        // Automatic Speed Change Logic
        const initialSpeed = parseFloat(speedInput.value);
        const finalSpeed = initialSpeed * (5 / 4);
        const duration = 30000; // 30 seconds(I set to 30s so there'll be at least 1min for a unchanged tempo clip)
        const startTime = Date.now();

        // Disable speed controls during automatic change
        speedSlider.disabled = true;
        speedInput.disabled = true;

        speedIntervalId = setInterval(() => {
            const elapsedTime = Date.now() - startTime;
            const progress = Math.min(elapsedTime / duration, 1); // Progress from 0 to 1

            const currentSpeed = initialSpeed - ((initialSpeed - finalSpeed) * progress);
            
            updateTempo(currentSpeed); // Reuse the existing update function

            if (progress >= 1) {
                clearInterval(speedIntervalId); // Stop the interval when done
                speedIntervalId = null;
            }
        }, 50); // Update every 50ms for a smooth transition

        const mediaStreamDestination = audioContext.createMediaStreamDestination();
        gainNode.connect(audioContext.destination);
        gainNode.connect(mediaStreamDestination);

        mediaRecorder = new MediaRecorder(mediaStreamDestination.stream);
        recordedChunks = [];
        mediaRecorder.ondataavailable = event => recordedChunks.push(event.data);
        // [修改后的代码]
        mediaRecorder.onstop = () => {
    // 使用 'audio/webm' 作为 MIME 类型，这是 MediaRecorder 更常见的输出格式
        const blob = new Blob(recordedChunks, { type: 'audio/webm' }); 
        const url = URL.createObjectURL(blob);
        const audioElement = new Audio(url);
        audioElement.controls = true;
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
    // 将下载文件的扩展名更改为 .webm
        downloadLink.download = 'processed_audio.webm'; 
        downloadLink.textContent = 'Download Processed Audio';
    
        recordedAudioContainer.innerHTML = '';
        recordedAudioContainer.appendChild(audioElement);
        recordedAudioContainer.appendChild(downloadLink);
};
        mediaRecorder.start();

        playButton.disabled = true;
        stopButton.disabled = false;
        recordingIndicator.style.display = 'block';
    });

    stopButton.addEventListener('click', () => {
        // Clear the speed interval if it's running
        if (speedIntervalId) {
            clearInterval(speedIntervalId);
            speedIntervalId = null;
        }

        //  Re-enable speed controls
        speedSlider.disabled = false;
        speedInput.disabled = false;

        if (shifter) {
            shifter.disconnect();
            shifter = null;
        }

        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        
        playButton.disabled = false;
        stopButton.disabled = true;
        recordingIndicator.style.display = 'none';
    });
    
    // --- Tempo Controls ---
    function updateTempo(newTempo) {
        const speed = parseFloat(newTempo);
        speedSlider.value = speed;
        speedInput.value = speed.toFixed(3);
        if (shifter) {
            shifter.tempo = speed;
        }
    }

    speedSlider.addEventListener('input', (event) => updateTempo(event.target.value));
    speedInput.addEventListener('input', (event) => updateTempo(event.target.value));

    // --- Volume Controls  ---
    function updateVolume(newVolume) {
        const volume = parseFloat(newVolume);
        volumeSlider.value = volume;
        volumeInput.value = volume.toFixed(3);
        gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    }
    volumeSlider.addEventListener('input', (event) => updateVolume(event.target.value));
    volumeInput.addEventListener('input', (event) => updateVolume(event.target.value));

    // --- Filter Controls ---
    lowpassToggle.addEventListener('change', () => {
        const enabled = lowpassToggle.checked;
        frequencySlider.disabled = !enabled;
        frequencyInput.disabled = !enabled;
        qSlider.disabled = !enabled;
        qInput.disabled = !enabled;
        
        connectAudioPath();
    });

    function updateFrequency(newFreq) {
        const freq = parseFloat(newFreq);
        frequencySlider.value = freq;
        frequencyInput.value = freq;
        lowpassFilter.frequency.setValueAtTime(freq, audioContext.currentTime);
    }
    frequencySlider.addEventListener('input', (event) => updateFrequency(event.target.value));
    frequencyInput.addEventListener('input', (event) => updateFrequency(event.target.value));

    function updateQ(newQ) {
        const q = parseFloat(newQ);
        qSlider.value = q;
        qInput.value = q.toFixed(1);
        lowpassFilter.q.setValueAtTime(q, audioContext.currentTime);
    }
    qSlider.addEventListener('input', (event) => updateQ(event.target.value));
    qInput.addEventListener('input', (event) => updateQ(event.target.value));
});