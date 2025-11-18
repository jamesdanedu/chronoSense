/**
 * MQ-7 Carbon Monoxide (CO) Sensor for micro:bit
 * 
 * Detects: Carbon Monoxide (CO)
 * Applications: Indoor air quality monitoring, vehicle exhaust detection
 * 
 * Hardware Connections:
 * - VCC: 5V (if available) or 3.3V
 * - GND: Ground
 * - AO (Analog Out): Pin 0
 * - DO (Digital Out): Pin 1 (optional threshold detection)
 * 
 * CRITICAL SAFETY NOTES:
 * - Carbon monoxide is DEADLY and ODORLESS
 * - This is for EDUCATIONAL purposes only
 * - NEVER rely on this for actual CO safety detection
 * - Use proper CO detectors for real safety applications
 * - Adult supervision required for all experiments
 */

// Function to calculate checksum using modSum approach
function calculateChecksum(values: number[]): number {
    let sum = 0
    for (let value of values) {
        sum += Math.abs(Math.round(value)) % 10
    }
    return sum % 10
}

// Function to estimate CO concentration (relative scale)
function estimateCOConcentration(rawValue: number): number {
    // Calculate relative CO concentration (0-100 scale)
    let coLevel = Math.max(0, ((rawValue - cleanAirBaseline) / coSensitivityRange) * 100)
    return Math.min(100, Math.round(coLevel))
}

// Function to determine safety status with CO-specific thresholds
function getCOSafetyStatus(coLevel: number): string {
    if (coLevel < 5) return "SAFE"
    else if (coLevel < 15) return "TRACE"     // Trace amounts
    else if (coLevel < 35) return "CAUTION"  // Noticeable levels
    else if (coLevel < 60) return "WARNING"  // Concerning levels
    else return "DANGER"                     // High levels
}

// Function to get safety level number for data transmission
function getCOSafetyLevel(coLevel: number): number {
    if (coLevel < 5) return 0        // Safe
    else if (coLevel < 15) return 1  // Trace
    else if (coLevel < 35) return 2  // Caution
    else if (coLevel < 60) return 3  // Warning
    else return 4                    // Danger
}

// Variables
let rawReading = 0
let coConcentration = 0
let digitalReading = 0
let cleanAirBaseline = 150       // Clean air baseline
let coSensitivityRange = 300     // CO detection sensitivity range
let peakCOLevel = 0              // Track peak CO detection
let exposureTime = 0             // Track exposure duration
let warningCount = 0             // Count of warning events
let isCalibrating = false
let warmupComplete = false
let heatingCycle = true          // MQ-7 requires heating cycles
let cycleStartTime = 0
let readingHistory: number[] = []

// Enhanced calibration for CO detection
function calibrateForCO() {
    isCalibrating = true
    basic.showString("CO CALIBRATION")
    basic.showString("FRESH AIR ONLY")
    basic.showString("OPEN WINDOWS")
    basic.pause(4000)
    
    let total = 0
    let samples = 30  // More samples for CO accuracy
    
    basic.showString("SAMPLING...")
    for (let i = 0; i < samples; i++) {
        let reading = pins.analogReadPin(AnalogPin.P0)
        total += reading
        
        // Show progress with breathing pattern
        if (i % 2 == 0) {
            basic.showIcon(IconNames.Heart)
        } else {
            basic.showIcon(IconNames.SmallHeart)
        }
        basic.pause(300)
    }
    
    cleanAirBaseline = total / samples
    basic.clearScreen()
    basic.showString("CLEAN AIR:")
    basic.showNumber(cleanAirBaseline)
    basic.pause(2000)
    
    // Reset tracking variables
    peakCOLevel = 0
    exposureTime = 0
    warningCount = 0
    readingHistory = []
    
    basic.showString("CO CAL DONE")
    basic.pause(1500)
    isCalibrating = false
}

// Button handlers
input.onButtonPressed(Button.A, function() {
    // Show current CO status and safety level
    basic.showString("CO LEVEL:")
    basic.showNumber(coConcentration)
    basic.pause(1500)
    basic.showString(getCOSafetyStatus(coConcentration))
    basic.pause(2000)
    
    if (coConcentration > 15) {
        basic.showString("EXPOSURE:")
        basic.showNumber(exposureTime)
        basic.showString("SECONDS")
        basic.pause(2000)
    }
})

input.onButtonPressed(Button.B, function() {
    // Show detailed statistics
    basic.showString("PEAK CO:")
    basic.showNumber(peakCOLevel)
    basic.pause(1500)
    basic.showString("WARNINGS:")
    basic.showNumber(warningCount)
    basic.pause(1500)
    basic.showString("BASELINE:")
    basic.showNumber(cleanAirBaseline)
    basic.pause(1500)
})

input.onButtonPressed(Button.AB, function() {
    if (warmupComplete) {
        calibrateForCO()
    } else {
        basic.showString("HEATING ELEMENT")
        basic.showString("WAIT...")
        basic.pause(2000)
    }
})

// Setup
radio.setGroup(150)
radio.setTransmitPower(7)

// Startup sequence with CO warnings
basic.showString("MQ7 CO SENSOR")
basic.pause(1500)
basic.showString("DANGER: CO IS DEADLY")
basic.pause(2000)
basic.showString("EDUCATIONAL ONLY")
basic.pause(2000)

// Extended warmup period for CO sensor stability
basic.showString("HEATING CYCLE")
let startTime = input.runningTime()
let warmupDuration = 90000  // 90 seconds for CO sensor

while (input.runningTime() - startTime < warmupDuration) {
    let elapsed = input.runningTime() - startTime
    let remaining = Math.ceil((warmupDuration - elapsed) / 1000)
    
    basic.showNumber(remaining)
    basic.pause(800)
    
    // Heating indicator - special pattern for CO
    basic.showLeds(`
        # . . . #
        . # . # .
        . . # . .
        . # . # .
        # . . . #
    `)
    basic.pause(200)
}

warmupComplete = true
cycleStartTime = input.runningTime()
basic.showString("CO SENSOR READY")
basic.pause(2000)

// Main CO monitoring loop
basic.forever(function() {
    if (warmupComplete && !isCalibrating) {
        // Read sensor values
        rawReading = pins.analogReadPin(AnalogPin.P0)
        digitalReading = pins.digitalReadPin(DigitalPin.P1)
        
        // Add to reading history for trend analysis
        readingHistory.push(rawReading)
        if (readingHistory.length > 15) {
            readingHistory.shift()
        }
        
        // Calculate smoothed CO concentration
        let smoothTotal = 0
        for (let reading of readingHistory) {
            smoothTotal += reading
        }
        let smoothedReading = smoothTotal / readingHistory.length
        coConcentration = estimateCOConcentration(smoothedReading)
        
        // Update peak CO level
        if (coConcentration > peakCOLevel) {
            peakCOLevel = coConcentration
        }
        
        // Track exposure time for elevated levels
        if (coConcentration > 15) {
            exposureTime += 2  // Add 2 seconds per cycle
        } else {
            exposureTime = 0   // Reset if levels drop
        }
        
        // Get safety status
        let safetyStatus = getCOSafetyStatus(coConcentration)
        let safetyLevel = getCOSafetyLevel(coConcentration)
        
        // Critical visual and alarm feedback for CO
        if (safetyLevel == 0) {
            basic.showIcon(IconNames.Yes)           // Safe
        } else if (safetyLevel == 1) {
            basic.showIcon(IconNames.Diamond)       // Trace
        } else if (safetyLevel == 2) {
            basic.showIcon(IconNames.Confused)      // Caution
            led.plot(4, 0)  // Warning light
            basic.pause(300)
            led.unplot(4, 0)
        } else if (safetyLevel == 3) {
            // Warning level - urgent flashing
            warningCount++
            for (let i = 0; i < 2; i++) {
                basic.showIcon(IconNames.Sad)
                basic.pause(250)
                basic.clearScreen()
                basic.pause(250)
            }
        } else {
            // DANGER level - critical alarm
            warningCount++
            for (let i = 0; i < 4; i++) {
                basic.showIcon(IconNames.Skull)
                basic.pause(150)
                basic.clearScreen()
                basic.pause(150)
            }
            
            // Additional danger indication
            basic.showString("EVACUATE")
            basic.pause(1000)
        }
        
        // Calculate checksum for data integrity
        let values = [Math.round(smoothedReading), coConcentration, safetyLevel]
        let checksum = calculateChecksum(values)
        
        // Send data: smoothed_reading, co_concentration, safety_level, checksum
        let dataString = "" + Math.round(smoothedReading) + "," + coConcentration + "," + safetyLevel + "," + checksum
        radio.sendString(dataString)
        
        // Display CO level if detected
        if (coConcentration > 5) {
            basic.showNumber(coConcentration)
            basic.pause(1000)
        }
        
        basic.pause(2000)  // 2-second monitoring interval for CO
    }
})
