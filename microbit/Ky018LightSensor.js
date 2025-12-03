/**
 * KY-018 Light Sensor Module (Photoresistor/LDR)
 * For use with ChronoSense data acquisition application
 * 
 * Module Description:
 * Simple analog light sensor based on a photoresistor (LDR).
 * It outputs an analog voltage proportional to light intensity.
 * 
 * Hardware Connections:
 * - S (Signal): Connect to P0 (or any analog pin)
 * - + (VCC): Connect to 3.3V on micro:bit
 * - - (GND): Connect to GND on micro:bit
 * 
 * Sensor Characteristics:
 * - Type: Photoresistor (Light Dependent Resistor)
 * - Resistance range: ~10 kΩ (bright) to ~1 MΩ (dark)
 * - Response time: Moderate (10-100ms)
 * - Spectral response: Peak ~540nm (green), similar to human eye
 * - Output: Analog voltage (0-3.3V → 0-1023 on micro:bit)
 * 
 * Reading Interpretation:
 * - Higher values = More light (opposite of some LDR circuits!)
 * - This module has voltage divider: more light → higher voltage
 * - Typical ranges:
 *   · 0-50: Very dark (night, closed box)
 *   · 50-200: Dark (indoor, low light)
 *   · 200-400: Moderate (indoor lighting, shade)
 *   · 400-700: Bright (daylight, indirect sun)
 *   · 700-1023: Very bright (direct sunlight)
 * 
 * Applications:
 * - Day/night cycle monitoring
 * - Greenhouse light tracking
 * - Solar panel optimization
 * - Plant growth studies (photoperiod)
 * - Weather station (cloud cover estimation)
 * - Wildlife activity (dawn/dusk detection)
 * - Energy usage optimization
 * 
 * Classroom Experiments:
 * 1. Diurnal light patterns (sunrise/sunset timing)
 * 2. Seasonal day length changes
 * 3. Weather impact on light levels
 * 4. Window orientation comparison
 * 5. Tree canopy density measurement
 * 6. Shadow movement tracking
 * 7. Indoor vs outdoor light comparison
 * 
 * Data Format:
 * - light_level: Current light reading (0-1023)
 * - light_percent: Percentage of maximum (0-100%)
 * - average_level: Rolling average over time
 * - min_level: Minimum detected (daily darkness)
 * - max_level: Maximum detected (daily brightness)
 * - checksum: Data validation
 * 
 * Button Functions:
 * - Button A: Display current light level
 * - Button B: Reset min/max tracking (start new daily cycle)
 * - Button A+B: Show min/max range (useful for calibration)
 */

// Function to calculate checksum using modSum approach
function calculateChecksum(values: number[]): number {
    let sum = 0
    for (let value of values) {
        sum += Math.abs(Math.round(value)) % 10
    }
    return sum % 10
}

// Light level tracking
let currentLevel = 0
let minLevel = 1023
let maxLevel = 0
let levelSum = 0
let sampleCount = 0
let averageLevel = 0

// Smoothing and filtering
let smoothedLevel = 0
let smoothingFactor = 0.2  // Higher = less smoothing

// History for trend detection
let levelHistory: number[] = []
let historySize = 20  // Keep last 20 samples for trend analysis

// Light categories
let lightCategory = ""
let previousCategory = ""

// Change detection
let lastSignificantChange = 0
let changeThreshold = 50  // Minimum change to report
let changeEventCount = 0

// Timing for periodic summaries
let lastSummaryTime = 0
let summaryInterval = 300000  // 5 minutes

// Button A: Display current light level
input.onButtonPressed(Button.A, function() {
    basic.showString("L:")
    basic.showNumber(currentLevel)
    basic.pause(500)
    basic.showString("P:")
    basic.showNumber(Math.floor(currentLevel * 100 / 1023))
    basic.showString("%")
    basic.pause(1000)
    basic.clearScreen()
})

// Button B: Reset min/max tracking (start new measurement period)
input.onButtonPressed(Button.B, function() {
    basic.showString("RESET")
    minLevel = currentLevel
    maxLevel = currentLevel
    levelSum = 0
    sampleCount = 0
    changeEventCount = 0
    levelHistory = []
    
    basic.showIcon(IconNames.Yes)
    basic.pause(500)
    basic.clearScreen()
    
    serial.writeString("=== Daily Reset ===\n")
    serial.writeString("Min/Max tracking reset\n")
    serial.writeString("==================\n")
})

// Button A+B: Show min/max range
input.onButtonPressed(Button.AB, function() {
    basic.showString("MIN:")
    basic.showNumber(minLevel)
    basic.pause(1000)
    basic.showString("MAX:")
    basic.showNumber(maxLevel)
    basic.pause(1000)
    basic.showString("RNG:")
    basic.showNumber(maxLevel - minLevel)
    basic.pause(1000)
    basic.clearScreen()
})

// Categorize light level
function categorizeLightLevel(level: number): string {
    if (level < 50) {
        return "Very Dark"
    } else if (level < 200) {
        return "Dark"
    } else if (level < 400) {
        return "Moderate"
    } else if (level < 700) {
        return "Bright"
    } else {
        return "Very Bright"
    }
}

// Visual display of light level
function displayLightLevel(level: number) {
    basic.clearScreen()
    
    // Map 0-1023 to 0-25 LEDs
    let scaledLevel = Math.floor(level * 25 / 1023)
    
    // Display as bar graph filling from bottom
    for (let i = 0; i < scaledLevel && i < 25; i++) {
        let x = i % 5
        let y = 4 - Math.floor(i / 5)
        led.plot(x, y)
    }
}

// Alternative: Show light as brightness of center LED
function displayLightBrightness(level: number) {
    // Map 0-1023 to 0-255 brightness
    let brightness = Math.floor(level * 255 / 1023)
    
    basic.clearScreen()
    led.plotBrightness(2, 2, brightness)
}

// Calculate trend (rising, falling, stable)
function calculateTrend(): string {
    if (levelHistory.length < 5) {
        return "Stable"
    }
    
    // Compare first half to second half of history
    let firstHalf = 0
    let secondHalf = 0
    let halfPoint = Math.floor(levelHistory.length / 2)
    
    for (let i = 0; i < halfPoint; i++) {
        firstHalf += levelHistory[i]
    }
    for (let i = halfPoint; i < levelHistory.length; i++) {
        secondHalf += levelHistory[i]
    }
    
    let firstAvg = firstHalf / halfPoint
    let secondAvg = secondHalf / (levelHistory.length - halfPoint)
    let difference = secondAvg - firstAvg
    
    if (difference > 20) {
        return "Rising"
    } else if (difference < -20) {
        return "Falling"
    } else {
        return "Stable"
    }
}

// Detect significant changes (sunrise/sunset, clouds passing)
function detectSignificantChange(newLevel: number): boolean {
    let change = Math.abs(newLevel - smoothedLevel)
    let timeSinceLastChange = input.runningTime() - lastSignificantChange
    
    // Significant change if:
    // 1. Large change (>changeThreshold)
    // 2. Enough time has passed (avoid rapid triggers)
    if (change > changeThreshold && timeSinceLastChange > 30000) {
        lastSignificantChange = input.runningTime()
        changeEventCount += 1
        return true
    }
    
    return false
}

// Setup radio communication
radio.setGroup(144)
radio.setTransmitPower(7)

// Show startup sequence
basic.showString("KY018")
basic.pause(1000)

// Initial reading for calibration
let initialReading = pins.analogReadPin(AnalogPin.P0)
smoothedLevel = initialReading
currentLevel = initialReading
minLevel = initialReading
maxLevel = initialReading

basic.showString("LIGHT")
basic.showNumber(initialReading)
basic.pause(1000)
basic.clearScreen()

// Log startup
serial.writeString("\n*** KY-018 Light Sensor ***\n")
serial.writeString("Analog Pin: P0\n")
serial.writeString("Initial Reading: " + initialReading + "\n")
serial.writeString("Radio Channel: 144\n")

// Main monitoring loop
basic.forever(function() {
    // Read analog value from KY-018 (0-1023)
    let rawLevel = pins.analogReadPin(AnalogPin.P0)
    
    // Apply exponential smoothing to reduce noise
    smoothedLevel = (smoothingFactor * rawLevel) + ((1 - smoothingFactor) * smoothedLevel)
    currentLevel = Math.round(smoothedLevel)
    
    // Update statistics
    sampleCount += 1
    levelSum += currentLevel
    averageLevel = Math.floor(levelSum / sampleCount)
    
    // Track min/max (daily range)
    if (currentLevel < minLevel) {
        minLevel = currentLevel
        serial.writeString("New minimum: " + minLevel + "\n")
    }
    if (currentLevel > maxLevel) {
        maxLevel = currentLevel
        serial.writeString("New maximum: " + maxLevel + "\n")
    }
    
    // Update history for trend analysis
    levelHistory.push(currentLevel)
    if (levelHistory.length > historySize) {
        levelHistory.shift()
    }
    
    // Categorize light level
    lightCategory = categorizeLightLevel(currentLevel)
    
    // Check for category change (e.g., day to night transition)
    if (lightCategory != previousCategory && previousCategory != "") {
        serial.writeString("Light category changed: " + previousCategory + " → " + lightCategory + "\n")
        previousCategory = lightCategory
    } else if (previousCategory == "") {
        previousCategory = lightCategory
    }
    
    // Detect significant changes
    let significantChange = detectSignificantChange(rawLevel)
    if (significantChange) {
        serial.writeString("Significant light change detected! Change #" + changeEventCount + "\n")
        
        // Flash display on significant change
        basic.showIcon(IconNames.Diamond)
        basic.pause(200)
    }
    
    // Calculate light percentage (0-100%)
    let lightPercent = Math.floor(currentLevel * 100 / 1023)
    
    // Send data every reading
    let values = [currentLevel, lightPercent, averageLevel, minLevel, maxLevel]
    let checksum = calculateChecksum(values)
    
    // Format: current,percent,average,min,max,checksum
    radio.sendString("" + currentLevel + "," + lightPercent + "," + averageLevel + "," + minLevel + "," + maxLevel + "," + checksum)
    
    // Visual display - choose one method:
    displayLightLevel(currentLevel)  // Bar graph method
    // displayLightBrightness(currentLevel)  // Single LED brightness method
    
    // Delay between readings (adjust for your needs)
    basic.pause(1000)  // 1 reading per second
})

// Periodic summary reporting (every 5 minutes)
basic.forever(function() {
    basic.pause(summaryInterval)
    
    if (sampleCount > 0) {
        // Calculate statistics
        let range = maxLevel - minLevel
        let trend = calculateTrend()
        
        // Send detailed summary
        serial.writeString("\n======== 5-MINUTE LIGHT SUMMARY ========\n")
        serial.writeString("Current Level: " + currentLevel + " (" + lightCategory + ")\n")
        serial.writeString("Average Level: " + averageLevel + "\n")
        serial.writeString("Minimum Level: " + minLevel + "\n")
        serial.writeString("Maximum Level: " + maxLevel + "\n")
        serial.writeString("Daily Range: " + range + "\n")
        serial.writeString("Trend: " + trend + "\n")
        serial.writeString("Significant Changes: " + changeEventCount + "\n")
        serial.writeString("Samples Collected: " + sampleCount + "\n")
        serial.writeString("=======================================\n\n")
        
        // Send summary via radio with SUMMARY prefix
        radio.sendString("SUMMARY," + currentLevel + "," + averageLevel + "," + minLevel + "," + maxLevel + "," + range + "," + checksum)
    }
})

// Dawn/Dusk detection loop (monitors for day/night transitions)
basic.forever(function() {
    basic.pause(60000)  // Check every minute
    
    if (sampleCount > 10) {
        let trend = calculateTrend()
        
        // Detect dawn (light rising from darkness)
        if (previousCategory == "Very Dark" && lightCategory == "Dark" && trend == "Rising") {
            serial.writeString("\n*** DAWN DETECTED ***\n")
            serial.writeString("Time: " + Math.floor(input.runningTime() / 1000) + " seconds\n")
            serial.writeString("Light level: " + currentLevel + "\n\n")
            
            // Visual indication
            basic.showIcon(IconNames.Heart)
            basic.pause(1000)
            basic.clearScreen()
        }
        
        // Detect dusk (light falling into darkness)
        if (previousCategory == "Moderate" && lightCategory == "Dark" && trend == "Falling") {
            serial.writeString("\n*** DUSK DETECTED ***\n")
            serial.writeString("Time: " + Math.floor(input.runningTime() / 1000) + " seconds\n")
            serial.writeString("Light level: " + currentLevel + "\n\n")
            
            // Visual indication
            basic.showIcon(IconNames.Sad)
            basic.pause(1000)
            basic.clearScreen()
        }
    }
})

// Daily statistics report (every 24 hours from startup)
basic.forever(function() {
    basic.pause(86400000)  // 24 hours
    
    if (sampleCount > 0) {
        serial.writeString("\n\n")
        serial.writeString("╔════════════════════════════════════════╗\n")
        serial.writeString("║        24-HOUR DAILY REPORT            ║\n")
        serial.writeString("╚════════════════════════════════════════╝\n")
        serial.writeString("\n")
        serial.writeString("Minimum Light: " + minLevel + " (darkest)\n")
        serial.writeString("Maximum Light: " + maxLevel + " (brightest)\n")
        serial.writeString("Daily Range: " + (maxLevel - minLevel) + "\n")
        serial.writeString("Average Light: " + averageLevel + "\n")
        serial.writeString("Total Samples: " + sampleCount + "\n")
        serial.writeString("Light Changes: " + changeEventCount + "\n")
        serial.writeString("\n")
        serial.writeString("Starting new 24-hour period...\n")
        serial.writeString("\n\n")
        
        // Auto-reset for next day
        minLevel = currentLevel
        maxLevel = currentLevel
        changeEventCount = 0
        
        // Keep running averages
        // (Don't reset sampleCount or levelSum for long-term tracking)
    }
})

// Diagnostic loop - warns about potential issues
basic.forever(function() {
    basic.pause(300000)  // Every 5 minutes
    
    if (sampleCount > 10) {
        // Check if sensor appears stuck
        let range = maxLevel - minLevel
        if (range < 10) {
            serial.writeString("WARNING: Very low variation detected. Check sensor connection.\n")
        }
        
        // Check if always at extreme
        if (currentLevel < 10) {
            serial.writeString("WARNING: Sensor reading very dark. Is it covered?\n")
        } else if (currentLevel > 1010) {
            serial.writeString("WARNING: Sensor saturated (very bright). May clip readings.\n")
        }
        
        // Trend information
        let trend = calculateTrend()
        if (trend != "Stable") {
            serial.writeString("INFO: Light level " + trend + "\n")
        }
    }
})
