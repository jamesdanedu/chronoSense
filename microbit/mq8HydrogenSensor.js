/**
 * MQ-8 Hydrogen Gas (H2) Sensor for micro:bit
 * 
 * Detects: Hydrogen Gas (H2)
 * Applications: Fuel cell experiments, electrolysis monitoring, hydrogen production
 * 
 * Hardware Connections:
 * - VCC: 5V (if available) or 3.3V
 * - GND: Ground
 * - AO (Analog Out): Pin 0
 * - DO (Digital Out): Pin 1 (optional threshold detection)
 * 
 * Educational Applications:
 * - Electrolysis experiments (water splitting)
 * - Hydrogen fuel cell demonstrations
 * - Chemical reaction monitoring
 * - Renewable energy studies
 * 
 * Safety Notes:
 * - Hydrogen is flammable in concentrations above 4%
 * - Use in well-ventilated areas only
 * - Adult supervision required
 */

// Function to calculate checksum using modSum approach
function calculateChecksum(values: number[]): number {
    let sum = 0
    for (let value of values) {
        sum += Math.abs(Math.round(value)) % 10
    }
    return sum % 10
}

// Function to calculate hydrogen concentration
function calculateHydrogenLevel(rawValue: number): number {
    // Calculate relative hydrogen concentration (0-100 scale)
    let h2Level = Math.max(0, ((rawValue - airBaseline) / hydrogenRange) * 100)
    return Math.min(100, Math.round(h2Level))
}

// Function to estimate hydrogen production rate
function calculateProductionRate(currentLevel: number, previousLevel: number): number {
    // Calculate rate of change in hydrogen concentration
    let rate = currentLevel - previousLevel
    return Math.max(0, rate)  // Only positive rates (production)
}

// Function to determine hydrogen safety level
function getHydrogenSafetyLevel(h2Level: number): string {
    if (h2Level < 5) return "NONE"
    else if (h2Level < 20) return "TRACE"
    else if (h2Level < 40) return "LOW"
    else if (h2Level < 70) return "MEDIUM"
    else return "HIGH"
}

// Variables
let rawReading = 0
let hydrogenLevel = 0
let previousHydrogenLevel = 0
let digitalReading = 0
let airBaseline = 180           // Clean air baseline
let hydrogenRange = 400         // Hydrogen sensitivity range
let productionRate = 0          // Rate of hydrogen production
let totalProduction = 0         // Cumulative hydrogen detected
let productionEvents = 0        // Count of production events
let peakHydrogen = 0           // Peak hydrogen detected
let isCalibrating = false
let warmupComplete = false
let experimentMode = false      // Special mode for electrolysis experiments
let experimentStartTime = 0

// Calibration function optimized for hydrogen detection
function calibrateHydrogenSensor() {
    isCalibrating = true
    basic.showString("H2 CALIBRATION")
    basic.showString("CLEAN AIR NEEDED")
    basic.pause(3000)
    
    let total = 0
    let samples = 25
    
    basic.showString("BASELINE...")
    for (let i = 0; i < samples; i++) {
        let reading = pins.analogReadPin(AnalogPin.P0)
        total += reading
        
        // Hydrogen molecule animation
        if (i % 4 == 0) basic.showLeds(`
            . # . # .
            # . # . #
            . # . # .
            # . # . #
            . # . # .
        `)
        else if (i % 4 == 1) basic.showLeds(`
            # . # . #
            . # . # .
            # . # . #
            . # . # .
            # . # . #
        `)
        else basic.clearScreen()
        basic.pause(200)
    }
    
    airBaseline = total / samples
    basic.clearScreen()
    basic.showString("H2 BASELINE:")
    basic.showNumber(airBaseline)
    basic.pause(2000)
    
    // Reset experiment variables
    totalProduction = 0
    productionEvents = 0
    peakHydrogen = 0
    previousHydrogenLevel = 0
    
    basic.showString("H2 READY")
    basic.pause(1500)
    isCalibrating = false
}

// Start electrolysis experiment mode
function startExperimentMode() {
    experimentMode = true
    experimentStartTime = input.runningTime()
    totalProduction = 0
    productionEvents = 0
    
    basic.showString("EXPERIMENT MODE")
    basic.showString("H2 PRODUCTION")
    basic.pause(2000)
}

// Button handlers
input.onButtonPressed(Button.A, function() {
    // Show current hydrogen readings
    basic.showString("H2 LEVEL:")
    basic.showNumber(hydrogenLevel)
    basic.pause(1500)
    basic.showString(getHydrogenSafetyLevel(hydrogenLevel))
    basic.pause(1500)
    
    if (productionRate > 0) {
        basic.showString("RATE:")
        basic.showNumber(productionRate)
        basic.pause(1500)
    }
})

input.onButtonPressed(Button.B, function() {
    // Show experiment statistics
    if (experimentMode) {
        let experimentTime = Math.round((input.runningTime() - experimentStartTime) / 1000)
        basic.showString("TIME:")
        basic.showNumber(experimentTime)
        basic.showString("SEC")
        basic.pause(2000)
        
        basic.showString("TOTAL H2:")
        basic.showNumber(totalProduction)
        basic.pause(1500)
        
        basic.showString("PEAK:")
        basic.showNumber(peakHydrogen)
        basic.pause(1500)
    } else {
        basic.showString("PEAK H2:")
        basic.showNumber(peakHydrogen)
        basic.pause(1500)
        basic.showString("EVENTS:")
        basic.showNumber(productionEvents)
        basic.pause(1500)
    }
})

input.onButtonPressed(Button.AB, function() {
    if (warmupComplete) {
        if (experimentMode) {
            experimentMode = false
            basic.showString("EXPERIMENT END")
            basic.pause(1500)
        } else {
            startExperimentMode()
        }
    } else {
        calibrateHydrogenSensor()
    }
})

// Setup
radio.setGroup(151)
radio.setTransmitPower(7)

// Startup sequence
basic.showString("MQ8 HYDROGEN")
basic.pause(1500)

// Warmup with hydrogen-specific timing
basic.showString("HEATING H2 SENSOR")
let startTime = input.runningTime()
let warmupDuration = 50000  // 50 seconds for hydrogen sensor

while (input.runningTime() - startTime < warmupDuration) {
    let elapsed = input.runningTime() - startTime
    let remaining = Math.ceil((warmupDuration - elapsed) / 1000)
    
    basic.showNumber(remaining)
    basic.pause(700)
    
    // H2 molecule animation during warmup
    basic.showLeds(`
        . . # . .
        . # # # .
        # # H # #
        . # # # .
        . . # . .
    `)
    basic.pause(300)
}

warmupComplete = true
basic.showString("H2 SENSOR READY")
basic.pause(2000)

// Take initial reading
previousHydrogenLevel = calculateHydrogenLevel(pins.analogReadPin(AnalogPin.P0))
basic.pause(1000)

// Main hydrogen monitoring loop
basic.forever(function() {
    if (warmupComplete && !isCalibrating) {
        // Read sensor values
        rawReading = pins.analogReadPin(AnalogPin.P0)
        digitalReading = pins.digitalReadPin(DigitalPin.P1)
        
        // Calculate hydrogen concentration
        hydrogenLevel = calculateHydrogenLevel(rawReading)
        
        // Calculate production rate
        productionRate = calculateProductionRate(hydrogenLevel, previousHydrogenLevel)
        
        // Update statistics
        if (hydrogenLevel > peakHydrogen) {
            peakHydrogen = hydrogenLevel
        }
        
        if (productionRate > 2) {  // Significant production detected
            productionEvents++
            if (experimentMode) {
                totalProduction += productionRate
            }
        }
        
        // Visual feedback for hydrogen detection
        let safetyLevel = getHydrogenSafetyLevel(hydrogenLevel)
        
        if (hydrogenLevel < 5) {
            basic.showIcon(IconNames.Surprised)    // No hydrogen
        } else if (hydrogenLevel < 20) {
            basic.showIcon(IconNames.Happy)        // Trace amounts
            led.plot(2, 0)  // Small indicator
            basic.pause(200)
            led.unplot(2, 0)
        } else if (hydrogenLevel < 40) {
            // Low hydrogen - gentle pulsing
            basic.showIcon(IconNames.Heart)
            basic.pause(300)
            basic.showIcon(IconNames.SmallHeart)
            basic.pause(200)
        } else if (hydrogenLevel < 70) {
            // Medium hydrogen - faster pulsing
            basic.showIcon(IconNames.Diamond)
            basic.pause(200)
            basic.showIcon(IconNames.SmallDiamond)
            basic.pause(200)
        } else {
            // High hydrogen - flashing (flammable warning)
            for (let i = 0; i < 2; i++) {
                basic.showLeds(`
                    # . # . #
                    . # # # .
                    # # # # #
                    . # # # .
                    # . # . #
                `)
                basic.pause(250)
                basic.clearScreen()
                basic.pause(250)
            }
        }
        
        // Special experiment mode feedback
        if (experimentMode && productionRate > 3) {
            basic.showString("H2 PROD!")
            basic.pause(500)
        }
        
        // Calculate checksum
        let values = [rawReading, hydrogenLevel, Math.round(productionRate)]
        let checksum = calculateChecksum(values)
        
        // Send data: raw_reading, hydrogen_level, production_rate, checksum
        let dataString = "" + rawReading + "," + hydrogenLevel + "," + Math.round(productionRate) + "," + checksum
        radio.sendString(dataString)
        
        // Display hydrogen level if significant
        if (hydrogenLevel > 5) {
            basic.showNumber(hydrogenLevel)
            basic.pause(1000)
        }
        
        // Update for next cycle
        previousHydrogenLevel = hydrogenLevel
        
        basic.pause(1500)  // Reading interval optimized for hydrogen response
    }
})
