/**
 * MQ-4 Methane Sensor (Natural Gas, CNG) for micro:bit
 * 
 * Detects: Methane, Natural Gas, CNG (Compressed Natural Gas)
 * Applications: Gas leak detection, environmental monitoring
 * 
 * Hardware Connections:
 * - VCC: 5V (if available) or 3.3V  
 * - GND: Ground
 * - AO (Analog Out): Pin 0
 * - DO (Digital Out): Pin 1 (optional threshold detection)
 * 
 * Safety Notes:
 * - For educational demonstration only
 * - Natural gas is flammable - use with proper ventilation
 * - Adult supervision required for any gas detection experiments
 */

// Function to calculate checksum using modSum approach
function calculateChecksum(values: number[]): number {
    let sum = 0
    for (let value of values) {
        sum += Math.abs(Math.round(value)) % 10
    }
    return sum % 10
}

// Function to calculate methane concentration level
function calculateMethaneLevel(rawValue: number): number {
    // Calculate relative methane concentration (0-100 scale)
    let methaneLevel = Math.max(0, ((rawValue - cleanAirBaseline) / methaneRange) * 100)
    return Math.min(100, Math.round(methaneLevel))
}

// Function to determine safety level
function getSafetyLevel(methaneLevel: number): number {
    if (methaneLevel < 10) return 0        // Safe
    else if (methaneLevel < 30) return 1   // Caution
    else if (methaneLevel < 70) return 2   // Warning
    else return 3                          // Danger
}

// Variables
let rawReading = 0
let methaneLevel = 0
let digitalReading = 0
let cleanAirBaseline = 200   // Baseline reading in clean air
let methaneRange = 400       // Sensitivity range for methane
let maxReading = 0           // Track maximum reading
let minReading = 1023        // Track minimum reading
let isCalibrating = false
let warmupComplete = false
let measurementCount = 0

// Calibration function
function calibrateCleanAir() {
    isCalibrating = true
    basic.showString("CALIBRATING")
    basic.showString("CLEAN AIR ONLY")
    basic.pause(2000)
    
    let total = 0
    let samples = 20
    
    for (let i = 0; i < samples; i++) {
        let reading = pins.analogReadPin(AnalogPin.P0)
        total += reading
        
        // Show progress
        led.plot(i % 5, Math.floor(i / 4))
        basic.pause(250)
    }
    
    cleanAirBaseline = total / samples
    basic.clearScreen()
    basic.showString("BASELINE:")
    basic.showNumber(cleanAirBaseline)
    basic.pause(2000)
    isCalibrating = false
}

// Button handlers
input.onButtonPressed(Button.A, function() {
    // Show current methane level and safety status
    basic.showString("CH4:")
    basic.showNumber(methaneLevel)
    basic.pause(1000)
    
    let safetyLevel = getSafetyLevel(methaneLevel)
    if (safetyLevel == 0) basic.showString("SAFE")
    else if (safetyLevel == 1) basic.showString("CAUTION") 
    else if (safetyLevel == 2) basic.showString("WARNING")
    else basic.showString("DANGER")
    basic.pause(2000)
})

input.onButtonPressed(Button.B, function() {
    // Show min/max readings
    basic.showString("MIN:")
    basic.showNumber(minReading)
    basic.pause(1500)
    basic.showString("MAX:")
    basic.showNumber(maxReading)
    basic.pause(1500)
})

input.onButtonPressed(Button.AB, function() {
    if (warmupComplete) {
        calibrateCleanAir()
    } else {
        basic.showString("WAIT FOR WARMUP")
    }
})

// Setup
radio.setGroup(147)
radio.setTransmitPower(7)

// Startup sequence
basic.showString("MQ4 METHANE")
basic.pause(1500)

// Extended warmup for methane sensor
basic.showString("WARMING UP")
let startTime = input.runningTime()
let warmupDuration = 60000  // 60 seconds warmup for stability

while (input.runningTime() - startTime < warmupDuration) {
    let remaining = Math.ceil((warmupDuration - (input.runningTime() - startTime)) / 1000)
    
    // Show countdown with flame animation
    basic.showNumber(remaining)
    basic.pause(800)
    basic.showIcon(IconNames.SmallSquare)
    basic.pause(200)
}

warmupComplete = true
basic.showString("SENSOR READY")
basic.pause(1500)

// Main measurement loop  
basic.forever(function() {
    if (warmupComplete && !isCalibrating) {
        // Read sensor values
        rawReading = pins.analogReadPin(AnalogPin.P0)
        digitalReading = pins.digitalReadPin(DigitalPin.P1)
        
        // Update min/max tracking
        if (rawReading > maxReading) maxReading = rawReading
        if (rawReading < minReading) minReading = rawReading
        
        // Calculate methane level
        methaneLevel = calculateMethaneLevel(rawReading)
        
        // Determine safety level for visual feedback
        let safetyLevel = getSafetyLevel(methaneLevel)
        
        // Visual and audio feedback based on safety level
        if (safetyLevel == 0) {
            basic.showIcon(IconNames.Yes)           // Safe - checkmark
        } else if (safetyLevel == 1) {
            basic.showIcon(IconNames.Confused)      // Caution 
            led.plot(0, 0)  // Additional warning light
        } else if (safetyLevel == 2) {
            // Warning - flashing
            basic.showIcon(IconNames.No)
            basic.pause(300)
            basic.clearScreen()
            basic.pause(200)
        } else {
            // Danger - rapid flashing with alarm pattern
            for (let i = 0; i < 3; i++) {
                basic.showIcon(IconNames.Skull)
                basic.pause(100)
                basic.clearScreen()
                basic.pause(100)
            }
        }
        
        // Calculate checksum
        let values = [rawReading, methaneLevel, safetyLevel]
        let checksum = calculateChecksum(values)
        
        // Send data: raw_reading, methane_level_percent, safety_level, checksum
        let dataString = "" + rawReading + "," + methaneLevel + "," + safetyLevel + "," + checksum
        radio.sendString(dataString)
        
        // Show methane level if detected
        if (methaneLevel > 5) {
            basic.showNumber(methaneLevel)
            basic.pause(1000)
        }
        
        measurementCount++
        basic.pause(1500)  // Reading interval
    }
})
