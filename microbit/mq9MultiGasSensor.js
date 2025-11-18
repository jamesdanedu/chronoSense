/**
 * MQ-9 Multi-Gas Sensor (CO, Methane, LPG) for micro:bit
 * 
 * Detects: Carbon Monoxide (CO), Methane (CH4), LPG, Propane
 * Applications: Comprehensive gas safety monitoring, multi-gas detection
 * 
 * Hardware Connections:
 * - VCC: 5V (if available) or 3.3V
 * - GND: Ground
 * - AO (Analog Out): Pin 0
 * - DO (Digital Out): Pin 1 (optional threshold detection)
 * 
 * Special Features:
 * - Dual detection: CO and flammable gases
 * - Automatic gas type estimation
 * - Enhanced safety monitoring
 * 
 * Safety Notes:
 * - Can detect multiple dangerous gases
 * - Educational use only - not for actual safety systems
 * - Requires proper ventilation during testing
 */

// Function to calculate checksum using modSum approach
function calculateChecksum(values: number[]): number {
    let sum = 0
    for (let value of values) {
        sum += Math.abs(Math.round(value)) % 10
    }
    return sum % 10
}

// Function to calculate gas concentration with dual sensitivity
function calculateGasLevel(rawValue: number, mode: string): number {
    let gasLevel = 0
    
    if (mode == "CO") {
        // CO detection mode (more sensitive to lower concentrations)
        gasLevel = Math.max(0, ((rawValue - baselineCO) / coSensitivity) * 100)
    } else {
        // Flammable gas mode (CH4, LPG detection)
        gasLevel = Math.max(0, ((rawValue - baselineFlammable) / flammableSensitivity) * 100)
    }
    
    return Math.min(100, Math.round(gasLevel))
}

// Function to estimate gas type based on response characteristics
function estimateGasType(rawValue: number, changeRate: number): string {
    // Analyze response pattern to estimate gas type
    if (changeRate > 30 && rawValue > baselineFlammable + 100) {
        return "LPG"      // Fast response, high reading
    } else if (changeRate > 15 && rawValue > baselineFlammable + 50) {
        return "CH4"      // Medium response
    } else if (rawValue > baselineCO + 30) {
        return "CO"       // Slower response, could be CO
    } else if (rawValue > Math.max(baselineCO, baselineFlammable) + 20) {
        return "MIXED"    // Multiple gases or unknown
    } else {
        return "NONE"     // No significant detection
    }
}

// Function to get comprehensive safety assessment
function getSafetyAssessment(gasType: string, gasLevel: number): string {
    if (gasType == "CO") {
        if (gasLevel < 10) return "CO_SAFE"
        else if (gasLevel < 30) return "CO_TRACE"
        else if (gasLevel < 60) return "CO_WARN"
        else return "CO_DANGER"
    } else if (gasType == "LPG" || gasType == "CH4") {
        if (gasLevel < 15) return "GAS_SAFE"
        else if (gasLevel < 35) return "GAS_DETECT"
        else if (gasLevel < 65) return "GAS_WARN"
        else return "GAS_DANGER"
    } else if (gasType == "MIXED") {
        if (gasLevel < 20) return "MULTI_LOW"
        else if (gasLevel < 50) return "MULTI_MED"
        else return "MULTI_HIGH"
    } else {
        return "SAFE"
    }
}

// Variables
let rawReading = 0
let previousReading = 0
let coLevel = 0
let flammableLevel = 0
let digitalReading = 0
let baselineCO = 160             // CO detection baseline
let baselineFlammable = 180      // Flammable gas baseline  
let coSensitivity = 250          // CO sensitivity range
let flammableSensitivity = 300   // Flammable gas sensitivity
let detectedGasType = "NONE"     // Current gas type
let safetyStatus = "SAFE"        // Overall safety status
let gasChangeRate = 0            // Rate of gas level change
let detectionHistory: string[] = [] // Track detection patterns
let isCalibrating = false
let warmupComplete = false
let dualMode = true              // Enable dual gas detection
let alertLevel = 0               // Overall alert level (0-4)

// Comprehensive calibration for dual gas detection
function calibrateDualSensor() {
    isCalibrating = true
    basic.showString("MQ9 DUAL CAL")
    basic.showString("FRESH AIR ONLY")
    basic.pause(3000)
    
    // Calibrate for CO detection
    basic.showString("CO BASELINE")
    let coTotal = 0
    let samples = 20
    
    for (let i = 0; i < samples; i++) {
        let reading = pins.analogReadPin(AnalogPin.P0)
        coTotal += reading
        
        // CO molecule animation
        basic.showLeds(`
            . # . # .
            # . . . #
            . . # . .
            # . . . #
            . # . # .
        `)
        basic.pause(300)
        basic.clearScreen()
        basic.pause(200)
    }
    
    baselineCO = coTotal / samples
    basic.showString("CO BASE:")
    basic.showNumber(baselineCO)
    basic.pause(2000)
    
    // Calibrate for flammable gases
    basic.showString("GAS BASELINE")
    let gasTotal = 0
    
    for (let i = 0; i < samples; i++) {
        let reading = pins.analogReadPin(AnalogPin.P0)
        gasTotal += reading
        
        // Flame animation for flammable gases
        basic.showLeds(`
            . . # . .
            . # # # .
            # # # # #
            . # # # .
            . . # . .
        `)
        basic.pause(300)
        basic.clearScreen()
        basic.pause(200)
    }
    
    baselineFlammable = gasTotal / samples
    basic.showString("GAS BASE:")
    basic.showNumber(baselineFlammable)
    basic.pause(2000)
    
    // Reset detection variables
    detectionHistory = []
    alertLevel = 0
    
    basic.showString("DUAL CAL DONE")
    basic.pause(1500)
    isCalibrating = false
}

// Button handlers
input.onButtonPressed(Button.A, function() {
    // Show current detection status
    basic.showString("GAS TYPE:")
    basic.showString(detectedGasType)
    basic.pause(2000)
    
    basic.showString("CO:")
    basic.showNumber(coLevel)
    basic.pause(1000)
    basic.showString("FLAM:")
    basic.showNumber(flammableLevel)
    basic.pause(1500)
    
    basic.showString("STATUS:")
    basic.showString(safetyStatus)
    basic.pause(2000)
})

input.onButtonPressed(Button.B, function() {
    // Show detection history and statistics
    basic.showString("HISTORY:")
    for (let i = 0; i < Math.min(3, detectionHistory.length); i++) {
        basic.showString(detectionHistory[detectionHistory.length - 1 - i])
        basic.pause(1500)
    }
    
    basic.showString("ALERT LVL:")
    basic.showNumber(alertLevel)
    basic.pause(1500)
})

input.onButtonPressed(Button.AB, function() {
    if (warmupComplete) {
        calibrateDualSensor()
    } else {
        basic.showString("DUAL WARMUP")
        basic.showString("WAIT...")
        basic.pause(2000)
    }
})

// Setup
radio.setGroup(152)
radio.setTransmitPower(7)

// Startup sequence
basic.showString("MQ9 MULTI-GAS")
basic.pause(2000)
basic.showString("CO + FLAMMABLE")
basic.pause(2000)

// Extended warmup for dual detection capability
basic.showString("DUAL HEATING")
let startTime = input.runningTime()
let warmupDuration = 75000  // 75 seconds for stable dual detection

while (input.runningTime() - startTime < warmupDuration) {
    let elapsed = input.runningTime() - startTime
    let remaining = Math.ceil((warmupDuration - elapsed) / 1000)
    
    basic.showNumber(remaining)
    basic.pause(600)
    
    // Dual heating animation
    if (remaining % 2 == 0) {
        basic.showLeds(`
            # . . . #
            . # . # .
            . . # . .
            . # . # .
            # . . . #
        `)  // CO pattern
    } else {
        basic.showLeds(`
            . . # . .
            . # # # .
            # # # # #
            . # # # .
            . . # . .
        `)  // Flame pattern
    }
    basic.pause(400)
}

warmupComplete = true
basic.showString("MQ9 READY")
basic.pause(2000)

// Take initial reading
previousReading = pins.analogReadPin(AnalogPin.P0)
basic.pause(1000)

// Main dual-gas monitoring loop
basic.forever(function() {
    if (warmupComplete && !isCalibrating) {
        // Read current sensor values
        rawReading = pins.analogReadPin(AnalogPin.P0)
        digitalReading = pins.digitalReadPin(DigitalPin.P1)
        
        // Calculate gas change rate
        gasChangeRate = Math.abs(rawReading - previousReading)
        
        // Calculate levels for both gas types
        coLevel = calculateGasLevel(rawReading, "CO")
        flammableLevel = calculateGasLevel(rawReading, "FLAMMABLE")
        
        // Estimate predominant gas type
        detectedGasType = estimateGasType(rawReading, gasChangeRate)
        
        // Add to detection history
        if (detectedGasType != "NONE") {
            detectionHistory.push(detectedGasType)
            if (detectionHistory.length > 10) {
                detectionHistory.shift()
            }
        }
        
        // Determine overall safety status
        let primaryLevel = Math.max(coLevel, flammableLevel)
        safetyStatus = getSafetyAssessment(detectedGasType, primaryLevel)
        
        // Set alert level (0-4 scale)
        if (primaryLevel < 10) alertLevel = 0      // Safe
        else if (primaryLevel < 25) alertLevel = 1 // Low
        else if (primaryLevel < 50) alertLevel = 2 // Medium
        else if (primaryLevel < 75) alertLevel = 3 // High
        else alertLevel = 4                        // Critical
        
        // Comprehensive visual feedback
        if (alertLevel == 0) {
            basic.showIcon(IconNames.Yes)           // All safe
        } else if (alertLevel == 1) {
            // Low detection - type-specific icon
            if (detectedGasType == "CO") {
                basic.showIcon(IconNames.Confused)
            } else {
                basic.showIcon(IconNames.Surprised)
            }
        } else if (alertLevel == 2) {
            // Medium - warning flash
            basic.showIcon(IconNames.Sad)
            basic.pause(400)
            basic.clearScreen()
            basic.pause(200)
        } else if (alertLevel == 3) {
            // High - urgent flashing
            for (let i = 0; i < 2; i++) {
                basic.showIcon(IconNames.No)
                basic.pause(300)
                basic.clearScreen()
                basic.pause(200)
            }
        } else {
            // Critical - emergency alarm
            for (let i = 0; i < 3; i++) {
                basic.showIcon(IconNames.Skull)
                basic.pause(200)
                basic.clearScreen()
                basic.pause(150)
            }
            
            // Show gas type for emergency response
            basic.showString(detectedGasType)
            basic.pause(1000)
        }
        
        // Calculate checksum for data transmission
        let values = [rawReading, coLevel, flammableLevel, alertLevel]
        let checksum = calculateChecksum(values)
        
        // Send data: raw_reading, co_level, flammable_level, alert_level, checksum
        let dataString = "" + rawReading + "," + coLevel + "," + flammableLevel + "," + alertLevel + "," + checksum
        radio.sendString(dataString)
        
        // Display predominant gas level
        if (primaryLevel > 8) {
            basic.showNumber(primaryLevel)
            basic.pause(1000)
        }
        
        // Update for next cycle
        previousReading = rawReading
        
        basic.pause(2000)  // 2-second monitoring interval
    }
})
