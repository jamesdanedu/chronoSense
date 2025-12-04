/**
 * This implementation uses the micro:bit's built-in analog microphone as an alternative for sound level detection and audio monitoring.
 * 
 * Hardware Connections (for micro:bit built-in mic):
 * 
 * - No external connections needed - uses onboard microphone
 * Alternative: Use analog microphone module
 * 
 * If you have an analog microphone module (like MAX4466, MAX9814):
 * - VCC: Connect to 3.3V on micro:bit
 * - GND: Connect to GND on micro:bit
 * - OUT: Connect to P0 (analog input)
 * 
 * Data Format:
 * 
 * - Sends: current_level, average_level, peak_level, checksum
 * 
 * - Sound level range: 0-255 (micro:bit scale)
 * 
 * Button Functions:
 * 
 * - Button A: Display current sound level
 * - Button B: Reset peak level tracking
 * - Button A+B: Calibrate noise floor
 */

// Function to calculate checksum using modSum approach
function calculateChecksum (values: any[]) {
    for (let value of values) {
        // Add ones digit of each absolute value to sum
        sum += Math.abs(Math.round(value)) % 10
    }
    // Return ones digit of sum
    return sum % 10
}
// Function to update moving average
// Calculate average
function updateAverage (newValue: number) {
    let levelHistory: number[] = []
    // Add new value to history
    levelHistory.push(newValue)
    // Remove oldest value if history is full
    if (levelHistory.length > historySize) {
        levelHistory.shift()
    }
    for (let value2 of levelHistory) {
        sum2 += value2
    }
    averageLevel = Math.floor(sum2 / levelHistory.length)
}
// Button A: Display current sound level
input.onButtonPressed(Button.A, function () {
    basic.showNumber(currentLevel)
    basic.pause(1000)
    basic.clearScreen()
})

// Button A+B: Calibrate noise floor
// Sample ambient noise for 3 seconds
input.onButtonPressed(Button.AB, function () {
    isCalibrating = true
    basic.showString("CAL")
    calibrationStart = input.runningTime()
    while (input.runningTime() - calibrationStart < 3000) {
        // Use built-in microphone
        sample = input.soundLevel()
        calibrationSum += sample
        calibrationSamples += 1
        // Show progress
        progress = Math.floor((input.runningTime() - calibrationStart) / 600)
        basic.clearScreen()
        for (let i = 0; i <= progress && i < 5; i++) {
            led.plot(i, 2)
        }
basic.pause(50)
    }
    // Calculate noise floor
    if (calibrationSamples > 0) {
        noiseFloor = Math.floor(calibrationSum / calibrationSamples)
    }
    // Show completion
    basic.showIcon(IconNames.Yes)
    basic.pause(1000)
    basic.clearScreen()
    isCalibrating = false
})
// Button B: Reset peak level
input.onButtonPressed(Button.B, function () {
    peakLevel = 0
    basic.showString("RST")
    basic.pause(500)
    basic.clearScreen()
})
// Function to create visual bar graph of sound level
function displaySoundLevel (level: number) {
    basic.clearScreen()
    // Map level to 0-25 for 5x5 display
    scaledLevel = Math.floor(level * 25 / 255)
    // Display as bar graph
    for (let j = 0; j <= scaledLevel - 1; j++) {
        x = j % 5
        y = 4 - Math.floor(j / 5)
        led.plot(x, y)
    }
}
let dataString = ""
let checksum = 0
let values: number[] = []
let rawLevel = 0
let levelSum = 0
let longTermAverage = 0
let sampleCount = 0
let y = 0
let x = 0
let scaledLevel = 0
let peakLevel = 0
let progress = 0
let calibrationSamples = 0
let calibrationSum = 0
let sample = 0
let calibrationStart = 0
let isCalibrating = false
let currentLevel = 0
let averageLevel = 0
let sum2 = 0
let sum = 0
let noiseFloor = 0
let initialSum = 0
let historySize = 0
historySize = 10
// Setup radio communication
radio.setGroup(144)
radio.setTransmitPower(7)
// Show startup message
basic.showString("MIC")
basic.pause(500)
// Initial calibration
basic.showString("QUIET")
basic.pause(2000)
let initialSamples = 30
for (let index = 0; index < initialSamples; index++) {
    initialSum += input.soundLevel()
    basic.pause(100)
}
noiseFloor = Math.floor(initialSum / initialSamples)
basic.showIcon(IconNames.Yes)
basic.pause(500)
basic.clearScreen()
// Secondary loop for periodic statistics
basic.forever(function () {
    // Every 10 seconds, send a summary with long-term statistics
    basic.pause(10000)
    if (!(isCalibrating) && sampleCount > 0) {
        // Calculate long-term average
        longTermAverage = Math.floor(levelSum / sampleCount)
        // Send summary data
        serial.writeString("Summary - Avg: " + longTermAverage + ", Peak: " + peakLevel + ", Samples: " + sampleCount + "\n")
    }
})
// Main program loop
basic.forever(function () {
    if (!(isCalibrating)) {
        // Read sound level from built-in microphone
        // Range: 0-255
        rawLevel = input.soundLevel()
        // Subtract noise floor and constrain to positive values
        currentLevel = Math.max(0, rawLevel - noiseFloor)
        // Update peak level
        if (currentLevel > peakLevel) {
            peakLevel = currentLevel
        }
        // Update moving average
        updateAverage(currentLevel)
        // Update sample count and sum for overall statistics
        sampleCount += 1
        levelSum += currentLevel
        // Display sound level as bar graph
        displaySoundLevel(currentLevel)
        // Calculate checksum
        values = [currentLevel, averageLevel, peakLevel]
        checksum = calculateChecksum(values)
        // Send data: current,average,peak,checksum
        dataString = "" + currentLevel + "," + averageLevel + "," + peakLevel + "," + checksum
        radio.sendString(dataString)
        // Brief delay between readings
        basic.pause(100)
    }
})
