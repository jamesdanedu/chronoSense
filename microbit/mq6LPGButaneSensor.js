/**
 * MQ-6 LPG & Butane Sensor for micro:bit
 * 
 * Detects: LPG, Butane, Propane
 * Applications: Camping stove monitoring, lighter fluid detection
 * 
 * Hardware Connections:
 * - VCC: 5V (if available) or 3.3V
 * - GND: Ground
 * - AO (Analog Out): Pin 0  
 * - DO (Digital Out): Pin 1 (optional threshold detection)
 * 
 * Educational Applications:
 * - Chemistry experiments with butane
 * - Understanding hydrocarbon detection
 * - Safety monitoring demonstrations
 */

// Function to calculate checksum using modSum approach
function calculateChecksum(values: number[]): number {
    let sum = 0
    for (let value of values) {
        sum += Math.abs(Math.round(value)) % 10
    }
    return sum % 10
}

// Function to calculate butane/LPG concentration
function calculateLPGConcentration(rawValue: number): number {
    // Optimized calculation for LPG/Butane detection
    let concentration = Math.max(0, ((rawValue - cleanAirReading) / lpgSensitivity) * 100)
    return Math.min(100, Math.round(concentration))
}

// Function to estimate gas type based on response pattern
function estimateGasType(currentReading: number, previousReading: number): string {
    let changeRate = Math.abs(currentReading - previousReading)
    
    if (changeRate > 50) return "FAST"     // Quick response (butane)
    else if (changeRate > 20) return "MED" // Medium response (LPG)
    else return "SLOW"                     // Slow response (propane)
}

// Variables
let rawReading = 0
let lpgConcentration = 0
let digitalReading = 0
let previousReading = 0
let cleanAirReading = 200    // Baseline for clean air
let lpgSensitivity = 250     // Sensitivity range for LPG/butane
let responsePattern = ""     // Track gas response pattern
let detectionEvents = 0      // Count detection events
let maxConcentration = 0     // Peak concentration detected
let isCalibrating = false
let warmupComplete = false
let sensitivityLevel = 1     // Adjustable sensitivity (1-3)

// Calibration function with sensitivity adjustment
function calibrateWithSensitivity() {
    isCalibrating = true
    basic.showString("SENSITIVITY CAL")
    
    // Step 1: Set sensitivity level
    basic.showString("SENS LEVEL")
    basic.showString("A=LOW B=HIGH")
    
    let sensitivitySet = false
    while (!sensitivitySet) {
        if (input.buttonIsPressed(Button.A)) {
            sensitivityLevel = 1
            basic.showString("LOW SENS")
            lpgSensitivity = 400  // Less sensitive
            sensitivitySet = true
        } else if (input.buttonIsPressed(Button.B)) {
            sensitivityLevel = 3
            basic.showString("HIGH SENS")
            lpgSensitivity = 150  // More sensitive
            sensitivitySet = true
        }
        basic.pause(100)
    }
    
    basic.pause(2000)
    
    // Step 2: Baseline calibration
    basic.showString("CLEAN AIR CAL")
    basic.showString("NO GAS PRESENT")
    basic.pause(3000)
    
    let total = 0
    let samples = 20
    
    for (let i = 0; i < samples; i++) {
        total += pins.analogReadPin(AnalogPin.P0)
        basic.showLeds(`
            # . . . .
            # # . . .
            # # # . .
            # # # # .
            # # # # #
        `)
        basic.pause(250)
        basic.clearScreen()
        basic.pause(250)
    }
    
    cleanAirReading = total / samples
    basic.showString("BASELINE:")
    basic.showNumber(cleanAirReading)
    basic.pause(2000)
    
    // Reset counters
    detectionEvents = 0
    maxConcentration = 0
    
    isCalibrating = false
    basic.showString("CALIBRATED")
    basic.pause(1000)
}

// Button handlers
input.onButtonPressed(Button.A, function() {
    // Show current readings and gas type estimation
    basic.showString("LPG:")
    basic.showNumber(lpgConcentration)
    basic.pause(1000)
    basic.showString("TYPE:")
    basic.showString(responsePattern)
    basic.pause(2000)
})

input.onButtonPressed(Button.B, function() {
    // Show statistics and sensitivity
    basic.showString("EVENTS:")
    basic.showNumber(detectionEvents)
    basic.pause(1500)
    basic.showString("MAX:")
    basic.showNumber(maxConcentration)
    basic.pause(1500)
    basic.showString("SENS:")
    basic.showNumber(sensitivityLevel)
    basic.pause(1500)
})

input.onButtonPressed(Button.AB, function() {
    if (warmupComplete) {
        calibrateWithSensitivity()
    } else {
        basic.showString("WARMUP NEEDED")
        basic.pause(1000)
    }
})

// Setup
radio.setGroup(149)
radio.setTransmitPower(7)

// Startup
basic.showString("MQ6 LPG/BUTANE")
basic.pause(1500)

// Warmup sequence with visual feedback
basic.showString("HEATING")
let startTime = input.runningTime()
let warmupDuration = 40000  // 40 seconds

while (input.runningTime() - startTime < warmupDuration) {
    let elapsed = input.runningTime() - startTime
    let remaining = Math.ceil((warmupDuration - elapsed) / 1000)
    
    basic.showNumber(remaining)
    basic.pause(600)
    
    // Heating element animation
    basic.showLeds(`
        . . # . .
        . # # # .
        # # # # #
        . # # # .
        . . # . .
    `)
    basic.pause(400)
}

warmupComplete = true
basic.showString("READY")
basic.pause(1500)

// Take initial reading
previousReading = pins.analogReadPin(AnalogPin.P0)
basic.pause(1000)

// Main detection loop
basic.forever(function() {
    if (warmupComplete && !isCalibrating) {
        // Read current sensor values
        rawReading = pins.analogReadPin(AnalogPin.P0)
        digitalReading = pins.digitalReadPin(DigitalPin.P1)
        
        // Calculate LPG concentration
        lpgConcentration = calculateLPGConcentration(rawReading)
        
        // Update maximum concentration
        if (lpgConcentration > maxConcentration) {
            maxConcentration = lpgConcentration
        }
        
        // Estimate gas type based on response
        responsePattern = estimateGasType(rawReading, previousReading)
        
        // Count significant detection events
        if (lpgConcentration > 20) {
            detectionEvents++
        }
        
        // Visual feedback based on concentration level
        if (lpgConcentration < 10) {
            basic.showIcon(IconNames.Yes)           // Safe
        } else if (lpgConcentration < 25) {
            basic.showIcon(IconNames.Diamond)       // Low detection
            led.plot(0, 0)  // Corner indicator
            basic.pause(200)
            led.unplot(0, 0)
        } else if (lpgConcentration < 50) {
            // Medium detection - pulsing
            basic.showIcon(IconNames.Square)
            basic.pause(400)
            basic.showIcon(IconNames.SmallSquare)
            basic.pause(200)
        } else if (lpgConcentration < 75) {
            // High detection - flashing warning
            basic.showIcon(IconNames.No)
            basic.pause(300)
            basic.clearScreen()
            basic.pause(200)
        } else {
            // Danger level - rapid alarm
            for (let i = 0; i < 3; i++) {
                basic.showIcon(IconNames.Skull)
                basic.pause(100)
                basic.clearScreen()
                basic.pause(100)
            }
        }
        
        // Calculate checksum
        let values = [rawReading, lpgConcentration, sensitivityLevel]
        let checksum = calculateChecksum(values)
        
        // Send data: raw_reading, lpg_concentration, sensitivity_level, checksum
        let dataString = "" + rawReading + "," + lpgConcentration + "," + sensitivityLevel + "," + checksum
        radio.sendString(dataString)
        
        // Display concentration if significant
        if (lpgConcentration > 8) {
            basic.showNumber(lpgConcentration)
            basic.pause(1000)
        }
        
        // Update previous reading for next comparison
        previousReading = rawReading
        
        basic.pause(1800)  // Reading interval optimized for LPG/butane response
    }
})
