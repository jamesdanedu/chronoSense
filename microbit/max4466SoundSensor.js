
// Enhanced signal processing with smoothing
function processSignal (rawValue: number) {
    // Apply exponential smoothing to reduce noise
    smoothedLevel = smoothingFactor * rawValue + (1 - smoothingFactor) * smoothedLevel
    return Math.round(smoothedLevel)
}
// Calibration function - measures ambient forest noise
// Sample ambient noise for 5 seconds
function calibrateAmbientNoise () {
    isCalibrating = true
    basic.showString("QUIET")
    basic.pause(2000)
    calibrationMin = 1023
    calibrationStart = input.runningTime()
    while (input.runningTime() - calibrationStart < 5000) {
        sample = pins.analogReadPin(AnalogPin.P0)
        calibrationSum += sample
        calibrationSamples += 1
        if (sample < calibrationMin) {
            calibrationMin = sample
        }
        if (sample > calibrationMax) {
            calibrationMax = sample
        }
        // Show progress
        progress = Math.floor((input.runningTime() - calibrationStart) / 1000)
        basic.clearScreen()
        for (let j = 0; j <= progress && j < 5; j++) {
            led.plot(j, 2)
        }
basic.pause(50)
    }
    // Calculate noise floor as average
    if (calibrationSamples > 0) {
        noiseFloor = Math.floor(calibrationSum / calibrationSamples)
        noiseRange = calibrationMax - calibrationMin
        // Set adaptive threshold based on noise characteristics
        // Larger range = more variable noise = higher threshold needed
        if (noiseRange < 50) {
            // Very stable/quiet environment
            adaptiveThreshold = noiseFloor + 40
            thresholdMultiplier = 1.3
        } else if (noiseRange < 100) {
            // Moderate noise variation
            adaptiveThreshold = noiseFloor + 60
            thresholdMultiplier = 1.5
        } else {
            // High noise variation (wind, etc.)
            adaptiveThreshold = noiseFloor + 80
            thresholdMultiplier = 2
        }
    }
    // Initialize smoothed level
    smoothedLevel = noiseFloor
    // Display calibration results
    basic.showIcon(IconNames.Yes)
    basic.showString("NF:")
    basic.showNumber(noiseFloor)
    basic.pause(1000)
    basic.showString("TH:")
    basic.showNumber(adaptiveThreshold)
    basic.pause(1500)
    basic.clearScreen()
    isCalibrating = false
    // Log calibration
    serial.writeString("" + ("=== Calibration Complete ===\n"))
    serial.writeString("Noise Floor: " + noiseFloor + "\n")
    serial.writeString("Threshold: " + adaptiveThreshold + "\n")
    serial.writeString("Multiplier: " + thresholdMultiplier + "\n")
    serial.writeString("" + ("===========================\n"))
}
// Function to calculate checksum using modSum approach
function calculateChecksum (values: any[]) {
    for (let value of values) {
        sum += Math.abs(Math.round(value)) % 10
    }
    return sum % 10
}
// Calculate activity index (events per minute, scaled 0-100)
function calculateActivityIndex () {
    currentTime = input.runningTime()
    recentEvents = recentEvents.filter(time => currentTime - time < activityWindow)
// Calculate events per minute
    eventsInWindow = recentEvents.length
    // Scale to 0-100 index (assume max 30 events/min = 100%)
    return Math.min(100, Math.floor(eventsInWindow * 100 / 30))
}
// 0-1, higher = less smoothing
// Button A: Display event count
input.onButtonPressed(Button.A, function () {
    basic.showString("E:")
    basic.showNumber(eventCount)
    basic.pause(500)
    basic.showString("A:")
    basic.showNumber(activityIndex)
    basic.pause(1000)
    basic.clearScreen()
})
// Adaptive threshold adjustment
function adjustThreshold () {
    // Lower threshold if quiet for extended period
    if (quietPeriodCounter > 150) {
        thresholdMultiplier = Math.max(1.2, thresholdMultiplier - 0.05)
        quietPeriodCounter = 0
        adaptiveThreshold = Math.floor(noiseFloor * thresholdMultiplier)
    }
    // Raise threshold if many events (avoid false positives)
    if (loudPeriodCounter > 50) {
        thresholdMultiplier = Math.min(3, thresholdMultiplier + 0.1)
        loudPeriodCounter = 0
        adaptiveThreshold = Math.floor(noiseFloor * thresholdMultiplier)
    }
}
// Button A+B: Show raw analog reading for gain adjustment
input.onButtonPressed(Button.AB, function () {
    basic.showString("RAW")
    // Show 10 readings to help adjust gain pot
    for (let index = 0; index < 10; index++) {
        rawValue = pins.analogReadPin(AnalogPin.P0)
        basic.showNumber(rawValue)
        basic.pause(500)
    }
    basic.showString("OK")
    basic.clearScreen()
})
// Button B: Full reset and recalibration
input.onButtonPressed(Button.B, function () {
    basic.showString("RESET")
    eventCount = 0
    peakLevel = 0
    levelSum = 0
    sampleCount = 0
    recentEvents = []
    activityIndex = 0
    smoothedLevel = 0
    // Recalibrate
    calibrateAmbientNoise()
})
// Visual feedback for bird activity
function displayActivity (level: number, eventDetected: boolean) {
    basic.clearScreen()
    if (eventDetected) {
        // Flash pattern for detected event
        basic.showLeds(`
            . # # # .
            # # # # #
            # # # # #
            # # # # #
            . # # # .
            `)
    } else {
        // Show current sound level as vertical bar
        // Map 0-1023 analog range to 0-25 LED positions
        scaledLevel = Math.floor(level * 25 / 1023)
        for (let k = 0; k < scaledLevel && k < 25; k++) {
            let x = k % 5
            let y = 4 - Math.floor(k / 5)
            led.plot(x, y)
        }
// Threshold indicator - top right LED
        if (level > adaptiveThreshold * 0.85) {
            led.plot(4, 0)
        }
    }
}
let checksum = 0
let values: number[] = []
let lastEventTime = 0
let timeSinceLastEvent = 0
let currentTime2 = 0
let currentLevel = 0
let rawLevel = 0
let recentAverage = 0
let newNoiseFloor = 0
let quickSum = 0
let quickSamples = 0
let checksum2 = 0
let values2: number[] = []
let averageLevel = 0
let scaledLevel = 0
let sampleCount = 0
let levelSum = 0
let peakLevel = 0
let rawValue = 0
let loudPeriodCounter = 0
let quietPeriodCounter = 0
let activityIndex = 0
let eventCount = 0
let eventsInWindow = 0
let currentTime = 0
let sum = 0
let adaptiveThreshold = 0
let noiseRange = 0
let noiseFloor = 0
let progress = 0
let calibrationMax = 0
let calibrationSamples = 0
let calibrationSum = 0
let sample = 0
let calibrationStart = 0
let calibrationMin = 0
let isCalibrating = false
let smoothedLevel = 0
let smoothingFactor = 0
let thresholdMultiplier = 0
// Activity monitoring
let recentEvents: number[] = []
// Minimum 300ms between events
let eventMinInterval = 300
// 1 minute window
let activityWindow = 60000
// Adaptive threshold parameters
thresholdMultiplier = 1.5
// 0-1, higher = less smoothing
smoothingFactor = 0.3
// Setup radio communication
radio.setGroup(144)
radio.setTransmitPower(7)
// Show startup sequence
basic.showString("MAX")
basic.showString("4466")
basic.pause(1000)
// Perform initial calibration
basic.showString("CAL")
calibrateAmbientNoise()
basic.showString("GO")
basic.pause(500)
basic.clearScreen()
// Log deployment start
serial.writeString("" + ("\n*** GY-MAX4466 Bird Detection ***\n"))
serial.writeString("" + ("Analog Pin: P0\n"))
serial.writeString("" + ("Radio Channel: 144\n"))
// Periodic summary reporting (every 5 minutes)
basic.forever(function () {
    // 5 minutes
    basic.pause(300000)
    if (!(isCalibrating) && sampleCount > 0) {
        // Calculate statistics
        averageLevel = Math.floor(levelSum / sampleCount)
        activityIndex = calculateActivityIndex()
        // Send summary with SUMMARY prefix for identification
        values2 = [
        eventCount,
        peakLevel,
        averageLevel,
        activityIndex
        ]
        checksum2 = calculateChecksum(values2)
        radio.sendString("SUMMARY," + eventCount + "," + peakLevel + "," + averageLevel + "," + activityIndex + "," + checksum2)
        // Detailed log
        serial.writeString("" + ("\n========= 5-MINUTE SUMMARY =========\n"))
        serial.writeString("Total Events: " + eventCount + "\n")
        serial.writeString("Peak Level: " + peakLevel + " (analog)\n")
        serial.writeString("Average Level: " + averageLevel + " (analog)\n")
        serial.writeString("Activity Index: " + activityIndex + "%\n")
        serial.writeString("Current Threshold: " + adaptiveThreshold + "\n")
        serial.writeString("Noise Floor: " + noiseFloor + "\n")
        serial.writeString("Samples Collected: " + sampleCount + "\n")
        serial.writeString("" + ("====================================\n\n"))
        // Reset peak for next period
        peakLevel = 0
    }
})
// Auto-calibration every hour (adapts to changing conditions)
basic.forever(function () {
    // 1 hour
    basic.pause(3600000)
    // Quick 3-second ambient sample
    if (!(isCalibrating)) {
        serial.writeString("" + ("\n--- Auto-calibration starting ---\n"))
        // 60 samples over 3 seconds
        quickSamples = 60
        for (let index = 0; index < quickSamples; index++) {
            quickSum += pins.analogReadPin(AnalogPin.P0)
            basic.pause(50)
        }
        // Update noise floor with weighted average (70% old, 30% new)
        newNoiseFloor = Math.floor(quickSum / quickSamples)
        noiseFloor = Math.floor(noiseFloor * 0.7 + newNoiseFloor * 0.3)
        adaptiveThreshold = Math.floor(noiseFloor * thresholdMultiplier)
        serial.writeString("New Noise Floor: " + noiseFloor + "\n")
        serial.writeString("New Threshold: " + adaptiveThreshold + "\n")
        serial.writeString("" + ("--- Auto-calibration complete ---\n\n"))
        // Brief visual confirmation
        basic.showIcon(IconNames.SmallDiamond)
        basic.pause(300)
        basic.clearScreen()
    }
})
// Diagnostic monitoring loop (every 30 seconds)
basic.forever(function () {
    basic.pause(30000)
    if (!(isCalibrating) && sampleCount > 100) {
        // Check for potential issues
        recentAverage = Math.floor(levelSum / sampleCount)
        // Warn if average is very close to noise floor (gain may be too low)
        if (recentAverage < noiseFloor + 10) {
            serial.writeString("" + ("WARNING: Signal near noise floor. Consider increasing gain.\n"))
        }
        // Warn if seeing very high levels constantly (gain may be too high)
        if (recentAverage > 800) {
            serial.writeString("" + ("WARNING: Signal constantly high. Consider decreasing gain.\n"))
        }
        // Warn if too many events (possible false positives)
        if (activityIndex > 80) {
            serial.writeString("" + ("WARNING: Very high activity detected. Check for false positives.\n"))
        }
    }
})
// Main detection loop
basic.forever(function () {
    if (!(isCalibrating)) {
        // Read analog value from MAX4466 (0-1023)
        rawLevel = pins.analogReadPin(AnalogPin.P0)
        // Apply signal processing
        currentLevel = processSignal(rawLevel)
        // Track statistics
        sampleCount += 1
        levelSum += currentLevel
        // Update peak
        if (currentLevel > peakLevel) {
            peakLevel = currentLevel
        }
        // Event detection logic
        currentTime2 = input.runningTime()
        timeSinceLastEvent = currentTime2 - lastEventTime
        // Detect sound event (raw level above threshold and minimum interval elapsed)
        if (rawLevel > adaptiveThreshold && timeSinceLastEvent > eventMinInterval) {
            // Bird call detected!
            eventCount += 1
            lastEventTime = currentTime2
            recentEvents.push(currentTime2)
            loudPeriodCounter += 1
            // Visual feedback
            displayActivity(currentLevel, true)
            // Calculate activity index
            activityIndex = calculateActivityIndex()
            // Send event notification with enhanced data
            values = [
            eventCount,
            peakLevel,
            currentLevel,
            activityIndex
            ]
            checksum = calculateChecksum(values)
            // Format: events,peak,current,activity,checksum
            radio.sendString("" + eventCount + "," + peakLevel + "," + currentLevel + "," + activityIndex + "," + checksum)
            // Detailed serial logging
            serial.writeString("EVENT #" + eventCount + " | ")
            serial.writeString("Raw: " + rawLevel + " | ")
            serial.writeString("Smooth: " + currentLevel + " | ")
            serial.writeString("Activity: " + activityIndex + "% | ")
            serial.writeString("Time: " + Math.floor(currentTime2 / 1000) + "s\n")
            basic.pause(100)
        } else {
            // No event - normal monitoring
            quietPeriodCounter += 1
            displayActivity(currentLevel, false)
        }
        // Periodic threshold adjustment
        if (sampleCount % 200 == 0) {
            adjustThreshold()
        }
        // 20 samples per second
        basic.pause(50)
    }
})
