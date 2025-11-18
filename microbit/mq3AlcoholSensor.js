/**
 * MQ-3 Alcohol Sensor (Ethanol) for micro:bit
 * 
 * Detects: Alcohol, Ethanol
 * Applications: Breathalyzer experiments, fermentation monitoring
 * 
 * Hardware Connections:
 * - VCC: 5V (if available) or 3.3V
 * - GND: Ground
 * - AO (Analog Out): Pin 0
 * - DO (Digital Out): Pin 1 (optional threshold detection)
 * 
 * Educational Notes:
 * - Excellent for chemistry experiments involving fermentation
 * - Can detect alcohol vapors from hand sanitizer (safe demonstration)
 * - NOT for actual breathalyzer use - educational purposes only
 */

// Function to calculate checksum using modSum approach
function calculateChecksum(values: number[]): number {
    let sum = 0
    for (let value of values) {
        sum += Math.abs(Math.round(value)) % 10
    }
    return sum % 10
}

// Function to estimate relative alcohol concentration
function estimateAlcoholLevel(rawValue: number): number {
    // Map to relative scale (0-100%)
    let alcoholLevel = Math.max(0, ((rawValue - baselineReading) / alcoholSensitivity) * 100)
    return Math.min(100, Math.round(alcoholLevel))
}

// Variables
let rawReading = 0
let alcoholLevel = 0
let digitalReading = 0
let baselineReading = 250    // Typical baseline in clean air
let alcoholSensitivity = 300 // Sensitivity range for alcohol detection
let isCalibrating = false
let warmupComplete = false
let sampleCount = 0
let averageReading = 0

// Calibration for clean air baseline
function calibrateCleanAir() {
    isCalibrating = true
    basic.showString("CLEAN AIR")
    
    let total = 0
    let samples = 15
    
    basic.showString("BREATHE AWAY")
    basic.pause(2000)
    
    for (let i = 0; i < samples; i++) {
        total += pins.analogReadPin(AnalogPin.P0)
        basic.showLeds(`
            . . # . .
            . # . # .
            # . . . #
            . # . # .
            . . # . .
        `)
        basic.pause(300)
        basic.clearScreen()
        basic.pause(200)
    }
    
    baselineReading = total / samples
    basic.showString("BASELINE")
    basic.showNumber(baselineReading)
    basic.pause(2000)
    isCalibrating = false
}

// Button handlers
input.onButtonPressed(Button.A, function() {
    // Show current alcohol level
    basic.showString("ALCOHOL")
    basic.showNumber(alcoholLevel)
    basic.pause(2000)
})

input.onButtonPressed(Button.B, function() {
    // Show baseline and current raw reading
    basic.showString("BASE:")
    basic.showNumber(baselineReading)
    basic.pause(1500)
    basic.showString("NOW:")
    basic.showNumber(rawReading)
    basic.pause(1500)
})

input.onButtonPressed(Button.AB, function() {
    if (warmupComplete) {
        calibrateCleanAir()
    } else {
        basic.showString("WARMING UP")
    }
})

// Setup
radio.setGroup(146)
radio.setTransmitPower(7)

// Startup sequence
basic.showString("MQ3 ALCOHOL")
basic.pause(1000)

// Warmup period (alcohol sensors need longer warmup)
basic.showString("WARMING")
let startTime = input.runningTime()
let warmupDuration = 30000  // 30 seconds for alcohol sensor

while (input.runningTime() - startTime < warmupDuration) {
    let remaining = Math.ceil((warmupDuration - (input.runningTime() - startTime)) / 1000)
    basic.showNumber(remaining)
    
    // Show warming animation
    basic.showIcon(IconNames.SmallDiamond)
    basic.pause(500)
    basic.showIcon(IconNames.Diamond)
    basic.pause(500)
}

warmupComplete = true
basic.showString("READY")
basic.pause(1000)

// Main measurement loop
basic.forever(function() {
    if (warmupComplete && !isCalibrating) {
        // Read sensor values
        rawReading = pins.analogReadPin(AnalogPin.P0)
        digitalReading = pins.digitalReadPin(DigitalPin.P1)
        
        // Calculate alcohol level
        alcoholLevel = estimateAlcoholLevel(rawReading)
        
        // Running average for smoother readings
        sampleCount++
        averageReading = ((averageReading * Math.min(sampleCount - 1, 9)) + rawReading) / Math.min(sampleCount, 10)
        
        // Visual feedback based on alcohol detection
        if (alcoholLevel < 5) {
            basic.showIcon(IconNames.Happy)      // No alcohol detected
        } else if (alcoholLevel < 25) {
            basic.showIcon(IconNames.Surprised)  // Low alcohol
            basic.pause(200)
            basic.clearScreen()
            basic.pause(200)
        } else if (alcoholLevel < 60) {
            basic.showIcon(IconNames.Confused)   // Medium alcohol
            basic.pause(150)
            basic.clearScreen()
            basic.pause(150)
        } else {
            // High alcohol - flashing warning
            basic.showIcon(IconNames.No)
            basic.pause(100)
            basic.clearScreen()
            basic.pause(100)
        }
        
        // Calculate checksum
        let values = [rawReading, alcoholLevel, Math.round(averageReading)]
        let checksum = calculateChecksum(values)
        
        // Send data: raw_reading, alcohol_level_percent, average_reading, checksum
        let dataString = "" + rawReading + "," + alcoholLevel + "," + Math.round(averageReading) + "," + checksum
        radio.sendString(dataString)
        
        // Show alcohol level periodically
        if (alcoholLevel > 5) {
            basic.showNumber(alcoholLevel)
            basic.pause(1000)
        }
        
        basic.pause(2000)  // 2-second intervals for alcohol detection
    }
})
