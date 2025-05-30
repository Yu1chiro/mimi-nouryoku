let currentDialog = [];
let currentQuestion = null;
let isPlaying = false;

// DOM Elements
const topicInput = document.getElementById('topicInput');
const generateBtn = document.getElementById('generateBtn');
const loadingSection = document.getElementById('loadingSection');
const dialogSection = document.getElementById('dialogSection');
const dialogContext = document.getElementById('dialogContext');
const playDialogBtn = document.getElementById('playDialogBtn');
const audioProgress = document.getElementById('audioProgress');
const progressBar = document.getElementById('progressBar');
const questionSection = document.getElementById('questionSection');
const questionInstruction = document.getElementById('questionInstruction');
const optionsContainer = document.getElementById('optionsContainer');
const replayAllBtn = document.getElementById('replayAllBtn');
const replayDialogBtn = document.getElementById('replayDialogBtn');
const resultSection = document.getElementById('resultSection');
const resultContent = document.getElementById('resultContent');
const nextBtn = document.getElementById('nextBtn');

// Alert Container (akan ditambahkan ke DOM)
let alertContainer = null;

// Initialize Alert Container
function initAlertContainer() {
    if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.id = 'alertContainer';
        alertContainer.className = 'fixed top-4 right-4 z-50 space-y-2';
        document.body.appendChild(alertContainer);
    }
}

// Show Custom Alert
function showAlert(message, type = 'info', duration = 5000) {
    initAlertContainer();
    
    const alertId = 'alert-' + Date.now();
    const alertElement = document.createElement('div');
    alertElement.id = alertId;
    
    let bgColor, textColor, icon;
    switch (type) {
        case 'error':
            bgColor = 'bg-red-100 border-red-400 text-red-700';
            icon = '❌';
            break;
        case 'warning':
            bgColor = 'bg-yellow-100 border-yellow-400 text-yellow-700';
            icon = '⚠️';
            break;
        case 'success':
            bgColor = 'bg-green-100 border-green-400 text-green-700';
            icon = '✅';
            break;
        default:
            bgColor = 'bg-blue-100 border-blue-400 text-blue-700';
            icon = 'ℹ️';
    }
    
    alertElement.className = `${bgColor} border px-4 py-3 rounded-lg shadow-lg max-w-sm transform transition-all duration-300 ease-in-out translate-x-full opacity-0`;
    alertElement.innerHTML = `
        <div class="flex items-start">
            <span class="text-lg mr-3 mt-0.5">${icon}</span>
            <div class="flex-1">
                <div class="font-medium text-sm">${message}</div>
            </div>
            <button onclick="closeAlert('${alertId}')" class="ml-3 text-lg font-bold opacity-70 hover:opacity-100">×</button>
        </div>
    `;
    
    alertContainer.appendChild(alertElement);
    
    // Animate in
    setTimeout(() => {
        alertElement.classList.remove('translate-x-full', 'opacity-0');
        alertElement.classList.add('translate-x-0', 'opacity-100');
    }, 100);
    
    // Auto close
    if (duration > 0) {
        setTimeout(() => {
            closeAlert(alertId);
        }, duration);
    }
}

// Close Alert
function closeAlert(alertId) {
    const alertElement = document.getElementById(alertId);
    if (alertElement) {
        alertElement.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => {
            alertElement.remove();
        }, 300);
    }
}

// localStorage functions
function saveToLocalStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

function getFromLocalStorage(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error('Error reading from localStorage:', error);
        return null;
    }
}

function clearLocalStorage(key) {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        console.error('Error clearing localStorage:', error);
    }
}

// Event Listeners
generateBtn.addEventListener('click', generateDialog);
topicInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') generateDialog();
});
playDialogBtn.addEventListener('click', playDialog);
replayAllBtn.addEventListener('click', playDialog);
replayDialogBtn.addEventListener('click', playDialogOnly);
nextBtn.addEventListener('click', restart);

// Generate Dialog
async function generateDialog() {
    const topic = topicInput.value.trim();
    if (!topic) {
        showAlert('Silakan masukkan situasi dialog!', 'warning');
        return;
    }

    // Clear localStorage saat generate baru
    clearLocalStorage('jlpt_dialog_data');
    
    showLoading(true);
    hideAllSections();

    try {
        const response = await fetch('/api/generate-choukai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ topic })
        });

        const data = await response.json();
        
        if (response.status === 429) {
            // Rate limit exceeded
            const remainingTime = data.remainingTime;
            const count = data.count;
            
            if (count >= 3) {
                showAlert(`Anda telah mencapai batas maksimal 3 kali generate. Silakan tunggu ${remainingTime} detik untuk mencoba lagi.`, 'error', 8000);
            } else {
                showAlert(`Terlalu cepat! Silakan tunggu ${remainingTime} detik sebelum generate lagi. (${count}/3)`, 'warning', 6000);
            }
            return;
        }
        
        if (data.error) {
            throw new Error(data.error);
        }

        currentDialog = data.dialog;
        currentQuestion = data.question;
        
        // Save to localStorage
        saveToLocalStorage('jlpt_dialog_data', {
            dialog: currentDialog,
            question: currentQuestion,
            topic: topic,
            timestamp: Date.now()
        });
        
        displayDialog();
        showAlert('Dialog berhasil dibuat!', 'success');
        
    } catch (error) {
        console.error('Error:', error);
        showAlert('Gagal membuat dialog. Silakan coba lagi.', 'error');
    } finally {
        showLoading(false);
    }
}

// Display Dialog
function displayDialog() {
    dialogContext.textContent = `${currentQuestion.context}`;
    questionInstruction.textContent = currentQuestion.instruction;
    
    dialogSection.classList.remove('hidden');
    questionSection.classList.add('hidden');
    resultSection.classList.add('hidden');
}

// Play Dialog (JLPT Choukai Flow)
async function playDialog() {
    if (isPlaying) return;
    
    isPlaying = true;
    playDialogBtn.disabled = true;
    audioProgress.classList.remove('hidden');
    
    // Step 1: Bacakan soal pertama
    const audioStatus = document.getElementById('audioStatus');
    audioStatus.textContent = 'Membacakan soal...';
    progressBar.style.width = '20%';
    
    const questionUtterance = new SpeechSynthesisUtterance(currentQuestion.instruction);
    questionUtterance.lang = 'ja-JP';
    questionUtterance.rate = 1;
    
    questionUtterance.onend = () => {
        setTimeout(() => {
            // Step 2: Bacakan dialog
            audioStatus.textContent = 'Memutar dialog...';
            progressBar.style.width = '40%';
            playDialogLines();
        }, 1500);
    };
    
    speechSynthesis.speak(questionUtterance);
}

// Play Dialog Lines
function playDialogLines() {
    let currentIndex = 0;
    const totalLines = currentDialog.length;
    
    function playNext() {
        if (currentIndex < totalLines) {
            const line = currentDialog[currentIndex];
            const progress = 40 + ((currentIndex + 1) / totalLines) * 40; // 40-80%
            progressBar.style.width = progress + '%';
            
            // Text to speech untuk dialog
            const utterance = new SpeechSynthesisUtterance(line.text);
            utterance.lang = 'ja-JP';
            utterance.rate = 1;
            
            utterance.onend = () => {
                currentIndex++;
                if (currentIndex < totalLines) {
                    setTimeout(playNext, 1000); // Delay antar kalimat
                } else {
                    // Dialog selesai, bacakan soal lagi
                    setTimeout(() => {
                        repeatQuestionAndShow();
                    }, 1500);
                }
            };
            
            speechSynthesis.speak(utterance);
        }
    }
    
    playNext();
}

// Repeat Question and Show Options
function repeatQuestionAndShow() {
    const audioStatus = document.getElementById('audioStatus');
    audioStatus.textContent = 'Mengulangi soal...';
    progressBar.style.width = '90%';
    
    // Bacakan soal lagi
    const repeatUtterance = new SpeechSynthesisUtterance(currentQuestion.instruction);
    repeatUtterance.lang = 'ja-JP';
    repeatUtterance.rate = 1;
    
    repeatUtterance.onend = () => {
        setTimeout(() => {
            // Sembunyikan progress dan tampilkan soal
            audioProgress.classList.add('hidden');
            showQuestion();
            isPlaying = false;
            playDialogBtn.disabled = false;
        }, 1000);
    };
    
    speechSynthesis.speak(repeatUtterance);
}

// Play Dialog Only (tanpa soal)
function playDialogOnly() {
    if (isPlaying) return;
    
    isPlaying = true;
    replayDialogBtn.disabled = true;
    
    let currentIndex = 0;
    const totalLines = currentDialog.length;
    
    function playNext() {
        if (currentIndex < totalLines) {
            const line = currentDialog[currentIndex];
            
            const utterance = new SpeechSynthesisUtterance(line.text);
            utterance.lang = 'ja-JP';
            utterance.rate = 1;
            
            utterance.onend = () => {
                currentIndex++;
                if (currentIndex < totalLines) {
                    setTimeout(playNext, 1000);
                } else {
                    isPlaying = false;
                    replayDialogBtn.disabled = false;
                }
            };
            
            speechSynthesis.speak(utterance);
        }
    }
    
    playNext();
}

// Show Question
function showQuestion() {
    optionsContainer.innerHTML = '';
    
    currentQuestion.options.forEach((option, index) => {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'option-button bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded-lg p-4 cursor-pointer';
        optionDiv.innerHTML = `
            <div class="flex items-center">
                <span class="font-semibold text-blue-600 mr-3">${String.fromCharCode(65 + index)}.</span>
                <span class="text-gray-800">${option}</span>
            </div>
        `;
        
        optionDiv.addEventListener('click', () => selectAnswer(String.fromCharCode(65 + index)));
        optionsContainer.appendChild(optionDiv);
    });
    
    questionSection.classList.remove('hidden');
}

// Select Answer
async function selectAnswer(selectedOption) {
    // Disable all options
    const options = document.querySelectorAll('.option-button');
    options.forEach(opt => {
        opt.style.pointerEvents = 'none';
        opt.style.opacity = '0.6';
    });

    // Tampilkan loading animation
    showLoadingAnimation();

    try {
        const response = await fetch('/api/check-answer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                dialog: currentDialog,
                question: currentQuestion,
                userAnswer: selectedOption
            })
        });

        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }

        // Sembunyikan loading animation
        hideLoadingAnimation();
        
        showResult(data.analysis, selectedOption);
        
    } catch (error) {
        console.error('Error:', error);
        // Sembunyikan loading animation jika error
        hideLoadingAnimation();
        
        // Re-enable options jika error
        options.forEach(opt => {
            opt.style.pointerEvents = 'auto';
            opt.style.opacity = '1';
        });
        
        showAlert('Gagal memeriksa jawaban. Silakan coba lagi.', 'error');
    }
}

// Fungsi untuk menampilkan loading animation
function showLoadingAnimation() {
    // Buat elemen loading jika belum ada
    let loadingElement = document.getElementById('loading-overlay');
    if (!loadingElement) {
        loadingElement = document.createElement('div');
        loadingElement.id = 'loading-overlay';
        loadingElement.className = `
            fixed inset-0 bg-black bg-opacity-50 
            flex items-center justify-center z-50
            transition-opacity duration-300
        `;
        
        loadingElement.innerHTML = `
            <div class="bg-white rounded-lg p-8 max-w-sm mx-4 text-center shadow-2xl">
                <div class="flex flex-col items-center space-y-4">
                    <!-- Spinner Animation -->
                    <div class="relative">
                        <div class="w-12 h-12 border-4 border-blue-200 rounded-full animate-spin border-t-blue-600"></div>
                    </div>
                    
                    <!-- Loading Text -->
                    <div class="space-y-2">
                        <h3 class="text-lg font-semibold text-gray-800">
                            Menganalisis Jawaban...
                        </h3>
                        <p class="text-sm text-gray-600">
                            Gemini sedang memproses jawaban Anda
                        </p>
                    </div>
                    
                    <!-- Animated Dots -->
                    <div class="flex space-x-1">
                        <div class="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                        <div class="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style="animation-delay: 0.1s;"></div>
                        <div class="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style="animation-delay: 0.2s;"></div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(loadingElement);
    }
    
    // Tampilkan loading dengan fade-in effect
    loadingElement.style.display = 'flex';
    setTimeout(() => {
        loadingElement.style.opacity = '1';
    }, 10);
}

// Fungsi untuk menyembunyikan loading animation
function hideLoadingAnimation() {
    const loadingElement = document.getElementById('loading-overlay');
    if (loadingElement) {
        // Fade-out effect
        loadingElement.style.opacity = '0';
        setTimeout(() => {
            loadingElement.style.display = 'none';
        }, 300);
    }
}

// Show Result (tetap sama)
function showResult(analysis, userAnswer) {
    const isCorrect = userAnswer === currentQuestion.correct;
    
    resultContent.innerHTML = `
        <div class="text-center mb-6">
            <div class="text-6xl mb-4">
                ${isCorrect ? '🎉' : '📚'}
            </div>
            <h3 class="text-2xl font-bold ${isCorrect ? 'text-green-600' : 'text-red-600'} mb-2">
                ${isCorrect ? 'Benar!' : 'Kurang Tepat'}
            </h3>
            <p class="text-gray-600">
                Jawaban Anda: <span class="font-semibold">${userAnswer}</span> | 
                Jawaban Benar: <span class="font-semibold text-green-600">${currentQuestion.correct}</span>
            </p>
        </div>
        
        <div class="bg-gray-50 text-justify rounded-lg p-6">
            <h4 class="font-semibold text-gray-800 mb-3">Analisis:</h4>
            <div class="text-gray-700 leading-relaxed">
                ${analysis.replace(/\n/g, '<br>')}
            </div>
        </div>
        
        <div class="mt-6 bg-blue-50 rounded-lg p-4">
            <h4 class="font-semibold text-blue-800 mb-2">Dialog Lengkap:</h4>
            <div class="space-y-2">
                ${currentDialog.map(line => `
                    <div class="text-sm">
                        <span class="font-medium">${line.speaker}:</span>
                        <span class="text-blue-700">${line.text}</span>
                        <span class="text-gray-500 ml-2">(${line.translation})</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    questionSection.classList.add('hidden');
    resultSection.classList.remove('hidden');
}

// Utility Functions
function showLoading(show) {
    if (show) {
        loadingSection.classList.remove('hidden');
    } else {
        loadingSection.classList.add('hidden');
    }
}

function hideAllSections() {
    dialogSection.classList.add('hidden');
    questionSection.classList.add('hidden');
    resultSection.classList.add('hidden');
}

function restart() {
    currentDialog = [];
    currentQuestion = null;
    isPlaying = false;
    topicInput.value = '';
    hideAllSections();
    document.getElementById('topicSection').scrollIntoView({ behavior: 'smooth' });
}

// Initialize
topicInput.placeholder = `Contoh : Membeli minuman di Konbini, Memesan Ramen, Menyewa Sepeda, Menanyakan tugas kepada guru`;

// Load saved data on page load
window.addEventListener('DOMContentLoaded', () => {
    const savedData = getFromLocalStorage('jlpt_dialog_data');
    if (savedData && savedData.dialog && savedData.question) {
        currentDialog = savedData.dialog;
        currentQuestion = savedData.question;
        topicInput.value = savedData.topic || '';
        
        // Show alert untuk data yang dimuat
        showAlert('Data dialog sebelumnya dimuat dari penyimpanan lokal', 'info', 4000);
        displayDialog();
    }
});