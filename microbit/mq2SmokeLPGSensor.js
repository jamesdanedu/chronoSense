/**
 * MQ-2 Gas Sensor (Smoke, LPG, Propane) for micro:bit
 * 
 * Detects: Smoke, LPG, Propane, Hydrogen
 * 
 * Hardware Connections:
 * - VCC: 5V (if available) or 3.3V
 * - GND: Ground
 * - AO (Analog Out): Pin 0
 * - DO (Digital Out): Pin 1 (optional threshold detection)
 * 
 * Calibration Instructions:
 * 1. Warm up sensor for 20 seconds in clean air
 * 2. Press A+B to calibrate clean air baseline
 * 3. Sensor readings are relative to this baseline
 */

// Function to calculate checksum using modSum approach
function calculateChecksum(values: number[]): number {
    let sum = 0
    for (let value of values) {
        // Add ones digit of each absolute value to sum
        sum += Math.abs(Math.round(value)) % 10
    }
    // Return ones digit of sum
    return sum % 10
}

// Function to map analog reading to gas concentration level
function mapGasLevel(rawValue: number): number {
    // Normalize to 0-100 scale based on baseline
    let gasLevel = Math.max(0, ((rawValue - cleanAirBaseline) / sensitivityRange) * 100)
    return Math.min(100, gasLevel)
}

// Variables
let rawReading = 0
let gasLevel = 0
let digitalReading = 0
let cleanAirBaseline = 300  // Will be set during calibration
let sensitivityRange = 200  // Adjustment range for sensitivity
let isCalibrating = false
let warmupComplete = false
let warmupTime = 20000  // 20 seconds warmup

// Calibration function
function calibrateSensor() {
    isCalibrating = true
    basic.showString("CAL")
    
    // Take multiple readings for baseline
    let total = 0
    let samples = 10
    
    for (let i = 0; i < samples; i++) {
        total += pins.analogReadPin(AnalogPin.P0)
        basic.showNumber(i + 1)
        basic.pause(500)
    }
    
    cleanAirBaseline = total / samples
    basic.showString("OK")
    basic.pause(1000)
    isCalibrating = false
}

// Button handlers
input.onButtonPressed(Button.A, function() {
    // Show current baseline value
    basic.showString("BASE")
    basic.showNumber(cleanAirBaseline)
    basic.pause(2000)
    basic.clearScreen()
})

input.onButtonPressed(Button.B, function() {
    // Show current raw reading
    basic.showString("RAW")
    basic.showNumber(rawReading)
    basic.pause(2000)
    basic.clearScreen()
})

input.onButtonPressed(Button.AB, function() {
    if (warmupComplete) {
        calibrateSensor()
    } else {
        basic.showString("WARM UP")
        basic.pause(1000)
    }
})

// Setup
radio.setGroup(145)
radio.setTransmitPower(7)

// Show startup message
basic.showString("MQ2")

// Warmup period
basic.showString("WARM")
let startTime = input.runningTime()

// Warmup loop
while (input.runningTime() - startTime < warmupTime) {
    let remaining = Math.ceil((warmupTime - (input.runningTime() - startTime)) / 1000)
    basic.showNumber(remaining)
    basic.pause(1000)
}

basic.showString("READY")
warmupComplete = true
basic.pause(1000)

// Main measurement loop
basic.forever(function() {
    if (warmupComplete && !isCalibrating) {
        // Read analog sensor value
        rawReading = pins.analogReadPin(AnalogPin.P0)
        
        // Read digital threshold (if connected)
        digitalReading = pins.digitalReadPin(DigitalPin.P1)
        
        // Calculate gas concentration level
        gasLevel = mapGasLevel(rawReading)
        
        // Visual feedback based on gas level
        if (gasLevel < 20) {
            basic.showIcon(IconNames.Happy)     // Clean air
        } else if (gasLevel < 50) {
            basic.showIcon(IconNames.Confused)  // Moderate detection
        } else if (gasLevel < 80) {
            basic.showIcon(IconNames.Sad)       // High detection
        } else {
            basic.showIcon(IconNames.Skull)     // Dangerous levels
        }
        
        // Calculate checksum for data integrity
        let values = [rawReading, gasLevel, digitalReading]
        let checksum = calculateChecksum(values)
        
        // Send data: raw_value, gas_level_percent, digital_threshold, checksum
        let dataString = "" + rawReading + "," + gasLevel + "," + digitalReading + "," + checksum
        radio.sendString(dataString)
        
        // Brief display of gas level
        basic.pause(500)
        if (gasLevel > 10) {
            basic.showNumber(gasLevel)
            basic.pause(1500)
        }
        
        basic.pause(1000)  // Reading interval
    }
})
