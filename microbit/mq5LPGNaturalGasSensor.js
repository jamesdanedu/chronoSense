/**
 * MQ-5 LPG & Natural Gas Sensor for micro:bit
 * 
 * Detects: LPG (Liquid Petroleum Gas), Natural Gas, Coal Gas
 * Applications: Gas leak detection, kitchen safety monitoring
 * 
 * Hardware Connections:
 * - VCC: 5V (if available) or 3.3V
 * - GND: Ground  
 * - AO (Analog Out): Pin 0
 * - DO (Digital Out): Pin 1 (optional threshold detection)
 * 
 * Safety Notes:
 * - LPG is highly flammable
 * - Use only in well-ventilated areas
 * - Educational demonstration only - not for actual safety systems
 */

// Function to calculate checksum using modSum approach
function calculateChecksum(values: number[]): number {
    let sum = 0
    for (let value of values) {
        sum += Math.abs(Math.round(value)) % 10
    }
    return sum % 10
}

// Function to calculate gas concentration with enhanced sensitivity
function calculateGasConcentration(rawValue: number): number {
    // Enhanced calculation for LPG detection
    let concentration = Math.max(0, ((rawValue - baselineValue) / gasRange) * 100)
    return Math.min(100, Math.round(concentration))
}

// Function to determine alert level
function getAlertLevel(gasLevel: number): string {
    if (gasLevel < 15) return "SAFE"
    else if (gasLevel < 35) return "DETECT"
    else if (gasLevel < 65) return "ALERT"
    else return "DANGER"
}

// Variables
let rawReading = 0
let gasConcentration = 0
let digitalReading = 0
let baselineValue = 180      // Clean air baseline
let gasRange = 350           // Detection range for LPG
let peakReading = 0          // Track peak detection
let alertCount = 0           // Count of alert conditions
let isCalibrating = false
let warmupComplete = false
let stabilizationCount = 0
let readingHistory: number[] = []

// Enhanced calibration with multiple gas types
function performCalibration() {
    isCalibrating = true
    basic.showString("CALIBRATION MODE")
    basic.pause(1000)
    
    // Step 1: Clean air baseline
    basic.showString("CLEAN AIR")
    basic.showString("REMOVE GAS SOURCES")
    basic.pause(3000)
    
    let total = 0
    let samples = 25
    
    basic.showString("SAMPLING")
    for (let i = 0; i < samples; i++) {
        let reading = pins.analogReadPin(AnalogPin.P0)
        total += reading
        
        // Progress indicator
        let progress = Math.floor((i / samples) * 25)
        basic.clearScreen()
        for (let p = 0; p < progress; p++) {
            led.plot(p % 5, Math.floor(p / 5))
        }
        basic.pause(200)
    }
    
    baselineValue = total / samples
    basic.clearScreen()
    basic.showString("BASELINE:")
    basic.showNumber(baselineValue)
    basic.pause(2000)
    
    // Reset tracking variables
    peakReading = 0
    alertCount = 0
    readingHistory = []
    
    basic.showString("CALIBRATED")
    basic.pause(1000)
    isCalibrating = false
}

// Button handlers
input.onButtonPressed(Button.A, function() {
    // Display current status
    basic.showString("GAS:")
    basic.showNumber(gasConcentration)
    basic.pause(1000)
    basic.showString(getAlertLevel(gasConcentration))
    basic.pause(2000)
})

input.onButtonPressed(Button.B, function() {
    // Show statistics
    basic.showString("PEAK:")
    basic.showNumber(peakReading)
    basic.pause(1500)
    basic.showString("ALERTS:")
    basic.showNumber(alertCount)
    basic.pause(1500)
})

input.onButtonPressed(Button.AB, function() {
    if (warmupComplete) {
        performCalibration()
    } else {
        basic.showString("WARMING UP...")
        basic.pause(1000)
    }
})

// Setup
radio.setGroup(148)
radio.setTransmitPower(7)

// Startup sequence
basic.showString("MQ5 LPG/GAS")
basic.pause(1500)

// Warmup period with progress indicator
basic.showString("HEATING ELEMENT")
let startTime = input.runningTime()
let warmupTime = 45000  // 45 seconds warmup

while (input.runningTime() - startTime < warmupTime) {
    let elapsed = input.runningTime() - startTime
    let remaining = Math.ceil((warmupTime - elapsed) / 1000)
    
    // Animated warmup display
    basic.showNumber(remaining)
    basic.pause(700)
    
    // Heat indicator animation
    basic.showLeds(`
        . # # # .
        # . # . #
        # # # # #
        # . # . #
        . # # # .
    `)
    basic.pause(300)
}

warmupComplete = true
basic.showString("SENSOR READY")
basic.pause(1500)

// Initial stabilization readings
for (let i = 0; i < 10; i++) {
    let reading = pins.analogReadPin(AnalogPin.P0)
    readingHistory.push(reading)
    if (readingHistory.length > 10) {
        readingHistory.shift()  // Keep only last 10 readings
    }
    basic.pause(500)
}

// Main monitoring loop
basic.forever(function() {
    if (warmupComplete && !isCalibrating) {
        // Read sensor values
        rawReading = pins.analogReadPin(AnalogPin.P0)
        digitalReading = pins.digitalReadPin(DigitalPin.P1)
        
        // Update reading history for smoothing
        readingHistory.push(rawReading)
        if (readingHistory.length > 10) {
            readingHistory.shift()
        }
        
        // Calculate smoothed average
        let smoothedReading = 0
        for (let reading of readingHistory) {
            smoothedReading += reading
        }
        smoothedReading = smoothedReading / readingHistory.length
        
        // Calculate gas concentration
        gasConcentration = calculateGasConcentration(smoothedReading)
        
        // Update peak reading
        if (gasConcentration > peakReading) {
            peakReading = gasConcentration
        }
        
        // Alert level determination
        let alertLevel = getAlertLevel(gasConcentration)
        
        // Visual feedback based on gas level
        if (gasConcentration < 15) {
            basic.showIcon(IconNames.Happy)       // Safe
        } else if (gasConcentration < 35) {
            basic.showIcon(IconNames.Surprised)   // Detection
            led.plot(4, 0)  // Warning light
            basic.pause(200)
            led.unplot(4, 0)
        } else if (gasConcentration < 65) {
            // Alert level - flashing warning
            alertCount++
            basic.showIcon(IconNames.Sad)
            basic.pause(300)
            basic.clearScreen()
            basic.pause(200)
        } else {
            // Danger level - rapid alarm
            alertCount++
            for (let i = 0; i < 2; i++) {
                basic.showIcon(IconNames.Skull)
                basic.pause(150)
                basic.clearScreen()
                basic.pause(150)
            }
        }
        
        // Calculate checksum for data transmission
        let values = [Math.round(smoothedReading), gasConcentration, peakReading]
        let checksum = calculateChecksum(values)
        
        // Send data: smoothed_reading, gas_concentration, peak_reading, checksum
        let dataString = "" + Math.round(smoothedReading) + "," + gasConcentration + "," + peakReading + "," + checksum
        radio.sendString(dataString)
        
        // Display gas concentration if significant
        if (gasConcentration > 10) {
            basic.showNumber(gasConcentration)
            basic.pause(1000)
        }
        
        basic.pause(2000)  // 2-second monitoring interval
    }
})
