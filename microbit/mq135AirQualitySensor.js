/**
 * MQ-135 Air Quality Sensor for micro:bit
 * 
 * Detects: NH3, NOx, Alcohol, Benzene, Smoke, CO2, and other pollutants
 * Applications: Indoor air quality monitoring, pollution detection, environmental studies
 * 
 * Hardware Connections:
 * - VCC: 5V (if available) or 3.3V
 * - GND: Ground
 * - AO (Analog Out): Pin 0
 * - DO (Digital Out): Pin 1 (optional threshold detection)
 * 
 * Educational Applications:
 * - Environmental science projects
 * - Indoor air quality studies
 * - Pollution source identification
 * - Chemistry experiments involving various gases
 * 
 * Air Quality Index (AQI) Levels:
 * 0-50: Good (Green)
 * 51-100: Moderate (Yellow)
 * 101-150: Unhealthy for Sensitive Groups (Orange)
 * 151-200: Unhealthy (Red)
 * 201+: Very Unhealthy (Purple)
 */

// Function to calculate checksum using modSum approach
function calculateChecksum(values: number[]): number {
    let sum = 0
    for (let value of values) {
        sum += Math.abs(Math.round(value)) % 10
    }
    return sum % 10
}

// Function to calculate Air Quality Index (AQI) from sensor reading
function calculateAQI(rawValue: number): number {
    // Convert raw sensor reading to AQI scale (0-500)
    let aqi = Math.max(0, ((rawValue - cleanAirBaseline) / aqiRange) * 200)
    return Math.min(500, Math.round(aqi))
}

// Function to get AQI category and color code
function getAQICategory(aqi: number): string {
    if (aqi <= 50) return "GOOD"
    else if (aqi <= 100) return "MODERATE"  
    else if (aqi <= 150) return "SENSITIVE"
    else if (aqi <= 200) return "UNHEALTHY"
    else if (aqi <= 300) return "VERY_BAD"
    else return "HAZARDOUS"
}

// Function to get AQI color code for visualization
function getAQIColorCode(aqi: number): number {
    if (aqi <= 50) return 0      // Green (Good)
    else if (aqi <= 100) return 1 // Yellow (Moderate)
    else if (aqi <= 150) return 2 // Orange (Unhealthy for Sensitive)
    else if (aqi <= 200) return 3 // Red (Unhealthy)
    else return 4                // Purple (Very Unhealthy/Hazardous)
}

// Function to estimate predominant pollutant type
function estimatePollutantType(rawValue: number, changeRate: number, timeOfDay: number): string {
    // Analyze patterns to estimate pollutant sources
    
    if (changeRate > 40 && rawValue > cleanAirBaseline + 150) {
        return "SMOKE"     // Rapid increase, high reading
    } else if (changeRate > 25 && timeOfDay > 6 && timeOfDay < 10) {
        return "TRAFFIC"   // Morning traffic pattern
    } else if (rawValue > cleanAirBaseline + 100 && changeRate > 15) {
        return "CHEMICAL"  // Chemical vapors or solvents
    } else if (rawValue > cleanAirBaseline + 80 && changeRate < 10) {
        return "CO2"       // Gradual CO2 buildup
    } else if (rawValue > cleanAirBaseline + 50) {
        return "MIXED"     // Multiple pollutants
    } else {
        return "CLEAN"     // Relatively clean air
    }
}

// Variables
let rawReading = 0
let previousReading = 0
let digitalReading = 0
let cleanAirBaseline = 150       // Clean air baseline (calibrated)
let aqiRange = 400               // Range for AQI calculation
let currentAQI = 0               // Current Air Quality Index
let aqiCategory = "GOOD"         // AQI category
let pollutantType = "CLEAN"      // Estimated pollutant type
let changeRate = 0               // Rate of air quality change
let maxAQI = 0                   // Maximum AQI recorded
let averageAQI = 0               // Running average AQI
let measurementCount = 0         // Count of measurements
let aqiHistory: number[] = []    // AQI history for trending
let isCalibrating = false
let warmupComplete = false
let monitoringMode = "CONTINUOUS" // or "ALERT" mode
let alertThreshold = 100         // AQI threshold for alerts

// Comprehensive calibration for air quality monitoring
function calibrateAirQuality() {
    isCalibrating = true
    basic.showString("AIR QUALITY CAL")
    basic.showString("CLEAN OUTDOOR AIR")
    basic.pause(4000)
    
    let total = 0
    let samples = 30
    
    basic.showString("SAMPLING AIR...")
    for (let i = 0; i < samples; i++) {
        let reading = pins.analogReadPin(AnalogPin.P0)
        total += reading
        
        // Air quality visualization during calibration
        let progress = Math.floor((i / samples) * 25)
        basic.clearScreen()
        for (let p = 0; p < progress; p++) {
            led.plot(p % 5, Math.floor(p / 5))
        }
        basic.pause(400)
    }
    
    cleanAirBaseline = total / samples
    basic.clearScreen()
    basic.showString("CLEAN AIR:")
    basic.showNumber(cleanAirBaseline)
    basic.pause(2500)
    
    // Reset monitoring variables
    maxAQI = 0
    averageAQI = 0
    measurementCount = 0
    aqiHistory = []
    
    basic.showString("AQ CAL DONE")
    basic.pause(1500)
    isCalibrating = false
}

// Toggle monitoring mode
function toggleMonitoringMode() {
    if (monitoringMode == "CONTINUOUS") {
        monitoringMode = "ALERT"
        basic.showString("ALERT MODE")
        basic.showString("THRESHOLD:")
        basic.showNumber(alertThreshold)
    } else {
        monitoringMode = "CONTINUOUS"
        basic.showString("CONTINUOUS")
        basic.showString("MONITORING")
    }
    basic.pause(2000)
}

// Button handlers
input.onButtonPressed(Button.A, function() {
    // Show current air quality status
    basic.showString("AQI:")
    basic.showNumber(currentAQI)
    basic.pause(1500)
    
    basic.showString("CATEGORY:")
    basic.showString(aqiCategory)
    basic.pause(2000)
    
    basic.showString("POLLUTANT:")
    basic.showString(pollutantType)
    basic.pause(2000)
    
    if (aqiHistory.length > 3) {
        let recent = aqiHistory[aqiHistory.length - 1]
        let previous = aqiHistory[aqiHistory.length - 4]
        if (recent > previous + 10) {
            basic.showString("WORSENING")
        } else if (recent < previous - 10) {
            basic.showString("IMPROVING")
        } else {
            basic.showString("STABLE")
        }
        basic.pause(2000)
    }
})

input.onButtonPressed(Button.B, function() {
    // Show air quality statistics and trends
    basic.showString("MAX AQI:")
    basic.showNumber(maxAQI)
    basic.pause(1500)
    
    basic.showString("AVG AQI:")
    basic.showNumber(averageAQI)
    basic.pause(1500)
    
    basic.showString("SAMPLES:")
    basic.showNumber(measurementCount)
    basic.pause(1500)
    
    basic.showString("MODE:")
    basic.showString(monitoringMode)
    basic.pause(2000)
})

input.onButtonPressed(Button.AB, function() {
    if (warmupComplete) {
        if (input.buttonIsPressed(Button.A) && input.buttonIsPressed(Button.B)) {
            // Long press - calibrate
            calibrateAirQuality()
        } else {
            // Toggle monitoring mode
            toggleMonitoringMode()
        }
    } else {
        basic.showString("WARMUP ACTIVE")
        basic.pause(1500)
    }
})

// Setup
radio.setGroup(153)
radio.setTransmitPower(7)

// Startup sequence
basic.showString("MQ135 AIR QUALITY")
basic.pause(2000)
basic.showString("MULTI-POLLUTANT")
basic.pause(2000)

// Extended warmup for comprehensive air quality sensing
basic.showString("WARMING SENSOR")
let startTime = input.runningTime()
let warmupDuration = 120000  // 120 seconds for stable air quality readings

while (input.runningTime() - startTime < warmupDuration) {
    let elapsed = input.runningTime() - startTime
    let remaining = Math.ceil((warmupDuration - elapsed) / 1000)
    
    basic.showNumber(remaining)
    basic.pause(800)
    
    // Air quality monitoring animation
    basic.showLeds(`
        . # # # .
        # . . . #
        # . # . #
        # . . . #
        . # # # .
    `)
    basic.pause(200)
}

warmupComplete = true
basic.showString("AIR QUALITY")
basic.showString("MONITOR READY")
basic.pause(2000)

// Take initial readings for baseline
for (let i = 0; i < 5; i++) {
    let reading = pins.analogReadPin(AnalogPin.P0)
    aqiHistory.push(calculateAQI(reading))
    basic.pause(1000)
}
previousReading = pins.analogReadPin(AnalogPin.P0)

// Main air quality monitoring loop
basic.forever(function() {
    if (warmupComplete && !isCalibrating) {
        // Read sensor values
        rawReading = pins.analogReadPin(AnalogPin.P0)
        digitalReading = pins.digitalReadPin(DigitalPin.P1)
        
        // Calculate air quality metrics
        currentAQI = calculateAQI(rawReading)
        aqiCategory = getAQICategory(currentAQI)
        changeRate = Math.abs(rawReading - previousReading)
        
        // Update AQI history
        aqiHistory.push(currentAQI)
        if (aqiHistory.length > 20) {
            aqiHistory.shift()
        }
        
        // Update statistics
        measurementCount++
        if (currentAQI > maxAQI) {
            maxAQI = currentAQI
        }
        
        // Calculate running average
        let total = 0
        for (let aqi of aqiHistory) {
            total += aqi
        }
        averageAQI = Math.round(total / aqiHistory.length)
        
        // Estimate pollutant type
        let currentHour = Math.floor((input.runningTime() / 3600000) % 24)
        pollutantType = estimatePollutantType(rawReading, changeRate, currentHour)
        
        // Visual feedback based on AQI level
        let colorCode = getAQIColorCode(currentAQI)
        
        if (colorCode == 0) {
            // Good - green equivalent (happy face)
            basic.showIcon(IconNames.Happy)
        } else if (colorCode == 1) {
            // Moderate - yellow equivalent (confused face)
            basic.showIcon(IconNames.Confused)
        } else if (colorCode == 2) {
            // Unhealthy for sensitive - orange (sad face)
            basic.showIcon(IconNames.Sad)
            led.plot(0, 0)  // Warning indicator
            basic.pause(300)
            led.unplot(0, 0)
        } else if (colorCode == 3) {
            // Unhealthy - red (no symbol)
            basic.showIcon(IconNames.No)
            basic.pause(400)
            basic.clearScreen()
            basic.pause(200)
        } else {
            // Very unhealthy/hazardous - purple (skull)
            for (let i = 0; i < 2; i++) {
                basic.showIcon(IconNames.Skull)
                basic.pause(300)
                basic.clearScreen()
                basic.pause(200)
            }
        }
        
        // Alert mode specific behavior
        if (monitoringMode == "ALERT" && currentAQI > alertThreshold) {
            basic.showString("AIR ALERT!")
            basic.showNumber(currentAQI)
            basic.pause(1000)
        }
        
        // Calculate checksum for data transmission
        let values = [rawReading, currentAQI, averageAQI, colorCode]
        let checksum = calculateChecksum(values)
        
        // Send comprehensive air quality data
        // Format: raw_reading, current_aqi, average_aqi, color_code, checksum
        let dataString = "" + rawReading + "," + currentAQI + "," + averageAQI + "," + colorCode + "," + checksum
        radio.sendString(dataString)
        
        // Display current AQI if significant
        if (currentAQI > 25) {
            basic.showNumber(currentAQI)
            basic.pause(1500)
        }
        
        // Show category for very poor air quality
        if (currentAQI > 150) {
            basic.showString(aqiCategory)
            basic.pause(1000)
        }
        
        // Update for next cycle
        previousReading = rawReading
        
        basic.pause(3000)  // 3-second monitoring interval for air quality
    }
})
