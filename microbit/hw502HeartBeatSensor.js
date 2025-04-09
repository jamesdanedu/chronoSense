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

// Initialize all variables at the top with proper values
let ANALOG_PIN = AnalogPin.P0
let RADIO_GROUP = 143
let DEBOUNCE_MS = 300
let SAMPLE_INTERVAL_MS = 20
let MIN_BEATS_FOR_BPM = 5
let CALIBRATION_SAMPLES = 100
let THRESHOLD_OFFSET = 50

// State variables
let rawMode = true
let isCalibrated = false
let threshold = 550
let beatCount = 0
let startTime = 0
let BPM = 0
let min = 1023
let max = 0
let sum = 0
let reading = 0
let previousReading = 0
let average = 0
let range = 0
let progress = 0
let lastBeat = 0
let brightness = 0
let elapsedSeconds = 0
let lastButtonPress = 0 // For debouncing buttons

// Setup radio communication right at the beginning
radio.setGroup(RADIO_GROUP)
radio.setTransmitPower(7)

// Toggle between raw and processed mode with debounce
input.onButtonPressed(Button.A, function () {
    // Debounce button presses
    if (input.runningTime() - lastButtonPress < 500) return
    lastButtonPress = input.runningTime()

    rawMode = !(rawMode)
    // Visual feedback for mode change
    if (rawMode) {
        basic.showIcon(IconNames.Heart)
    } else {
        basic.showIcon(IconNames.SmallHeart)
    }
    // Reset counters when changing modes
    beatCount = 0
    startTime = input.runningTime()
    // Short pause to see the icon before it gets overwritten
    basic.pause(500)
})

// Reset measurements and re-calibrate with debounce
input.onButtonPressed(Button.B, function () {
    // Debounce button presses
    if (input.runningTime() - lastButtonPress < 500) return
    lastButtonPress = input.runningTime()

    beatCount = 0
    startTime = input.runningTime()
    BPM = 0
    // Force re-calibration
    isCalibrated = false
    basic.showIcon(IconNames.No)
    basic.pause(500)
})

// Improved calibration function
function calibrateSensor() {
    // Reset calibration variables
    min = 1023
    max = 0
    sum = 0

    // Show calibration is starting
    basic.showLeds(`
        # . . . #
        . # . # .
        . . # . .
        . # . # .
        # . . . #
        `)

    // Use a smaller buffer for samples to avoid memory issues
    const bufferSize = 10
    let sampleCount = 0
    let totalSamples = 0

    // Collect samples in smaller batches
    while (totalSamples < CALIBRATION_SAMPLES) {
        for (let i = 0; i < bufferSize && totalSamples < CALIBRATION_SAMPLES; i++) {
            reading = pins.analogReadPin(ANALOG_PIN)
            sum += reading

            // Track min/max
            if (reading < min) {
                min = reading
            }
            if (reading > max) {
                max = reading
            }

            sampleCount++
            totalSamples++

            // Brief pause between samples
            basic.pause(10)
        }

        // Show progress by lighting LEDs - update less frequently
        progress = Math.floor(totalSamples / CALIBRATION_SAMPLES * 5)
        basic.clearScreen()
        for (let j = 0; j < progress; j++) {
            led.plot(j, 4)
        }

        // Allow other processes to run
        basic.pause(10)
    }

    // Calculate average and range - guard against division by zero
    if (sampleCount > 0) {
        average = sum / sampleCount
    } else {
        average = 500 // Fallback if no samples were collected
    }

    range = max - min

    // Set threshold based on average plus offset
    threshold = Math.floor(average + THRESHOLD_OFFSET)
    if (threshold < 100 || threshold > 1000) {
        // Fallback to a reasonable threshold if calculated one seems invalid
        threshold = 550
    }

    // Send calibration data over radio with checksum
    let values = [threshold]
    let checksum = calculateChecksum(values)
    radio.sendString(convertToText(threshold) + "," + convertToText(checksum))

    // Show success and clear
    basic.showIcon(IconNames.Yes)
    basic.pause(500)  // Shorter pause
    basic.clearScreen()

    // Mark as calibrated before continuing
    isCalibrated = true

    // Reset detection variables after calibration
    startTime = input.runningTime()
    beatCount = 0
    lastBeat = input.runningTime()

    // Add a brief pause after calibration to stabilize
    basic.pause(100)
}

// Initial greeting
basic.showString("HRM")
basic.pause(500)

// Main loop with improved error handling
basic.forever(function () {
    try {
        // Check if calibration is needed
        if (!isCalibrated) {
            calibrateSensor()
        }

        // Read sensor value with bounds check
        reading = pins.analogReadPin(ANALOG_PIN)
        if (reading < 0) reading = 0
        if (reading > 1023) reading = 1023

        // RAW MODE: Send all readings over radio
        // PROCESSED MODE: Detect beats and calculate BPM
        if (rawMode) {
            // Send reading with checksum
            let values = [reading]
            let checksum = calculateChecksum(values)
            radio.sendString(convertToText(reading) + "," + convertToText(checksum))

            // Simple visualization: LED brightness based on sensor reading
            brightness = Math.map(reading, threshold - 50, threshold + 100, 0, 255)
            brightness = Math.constrain(brightness, 0, 255)
            led.plotBrightness(2, 2, brightness)
        } else {
            // Advanced beat detection - looking for rising edge crossing threshold
            const currentTime = input.runningTime()
            if (reading > threshold && previousReading <= threshold && currentTime - lastBeat > DEBOUNCE_MS) {
                // Beat detected
                lastBeat = currentTime
                beatCount += 1

                // Visual pulse indicator (shorter flash)
                basic.showIcon(IconNames.Heart)
                basic.pause(50)  // Shorter pause
                basic.clearScreen()

                // Calculate BPM after collecting enough beats
                if (beatCount >= MIN_BEATS_FOR_BPM) {
                    elapsedSeconds = (currentTime - startTime) / 1000
                    // Prevent division by zero
                    if (elapsedSeconds > 0) {
                        BPM = Math.round(beatCount / elapsedSeconds * 60)

                        // Sanity check the BPM value (typical human range)
                        if (BPM >= 40 && BPM <= 200) {
                            // Send BPM with checksum
                            let values = [BPM]
                            let checksum = calculateChecksum(values)
                            radio.sendString(convertToText(BPM) + "," + convertToText(checksum))

                            // Display BPM on LEDs briefly
                            basic.showNumber(BPM)
                            basic.pause(500)  // Shorter pause
                            basic.clearScreen()
                        } else {
                            // Invalid BPM, show error
                            basic.showIcon(IconNames.Sad)
                            basic.pause(300)  // Shorter pause
                            basic.clearScreen()
                        }

                        // Reset for next calculation
                        beatCount = 0
                        startTime = currentTime
                    }
                }
            }
            // Store current reading for next comparison
            previousReading = reading
        }

        // Simplified visualization
        basic.clearScreen()

        // Show reading level with fewer LEDs to conserve memory
        const barLevel = Math.floor(reading / 204)  // Scale 0-1023 to 0-5
        for (let i = 0; i < barLevel; i++) {
            led.plot(i, 2)
        }

        // Indicator that reading is above threshold
        if (reading > threshold) {
            led.plot(4, 0)
        }

        // Short delay between readings
        basic.pause(SAMPLE_INTERVAL_MS)
    } catch (e) {
        // Error recovery
        basic.showIcon(IconNames.No)
        basic.pause(300)
        basic.clearScreen()

        // Try to reset to a stable state
        isCalibrated = false
        basic.pause(500)
    }
})
