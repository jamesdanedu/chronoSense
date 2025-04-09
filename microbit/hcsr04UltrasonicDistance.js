// HC-SR04 Ultrasonic Distance Sensor with Checksum
// Connect Trig to P1, Echo to P2

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

// Global variables
let distance = 0
let lastMeasurementTime = 0
let measurementInterval = 5000 // 5 seconds between measurements
let maxDistance = 400 // Maximum distance in cm
let errorCount = 0
let calibrationOffset = 0 // For calibration adjustments

// Button A: Reset error count
input.onButtonPressed(Button.A, function() {
    errorCount = 0
    basic.showIcon(IconNames.Yes)
    basic.pause(500)
    basic.clearScreen()
})

// Button B: Calibration mode
input.onButtonPressed(Button.B, function() {
    // Enter calibration mode
    basic.showString("CAL")
    
    // Take multiple measurements for accuracy
    let total = 0
    let samples = 5
    
    for (let i = 0; i < samples; i++) {
        // Get a measurement
        let raw = getRawDistance()
        if (raw >= 0) {
            total += raw
            led.plot(i, 2)
        }
        basic.pause(500)
    }
    
    // Calculate average
    let avgDistance = total / samples
    
    // Prompt user to input known distance (using A to increment, B to confirm)
    basic.showString("SET")
    let knownDistance = 30 // Start at 30cm
    
    // Wait for B press to confirm the known distance
    while (true) {
        // Show current value
        basic.showNumber(knownDistance)
        basic.pause(500)
        
        // Check for button presses
        if (input.buttonIsPressed(Button.A)) {
            knownDistance += 10
            if (knownDistance > 200) knownDistance = 10
            basic.pause(300)
        }
        
        if (input.buttonIsPressed(Button.B)) {
            break
        }
    }
    
    // Calculate offset
    calibrationOffset = knownDistance - avgDistance
    
    // Confirm calibration
    basic.showIcon(IconNames.Yes)
    basic.pause(1000)
    basic.clearScreen()
})

// Function to get raw distance measurement
function getRawDistance(): number {
    // Send 10μs pulse to trigger input
    pins.digitalWritePin(DigitalPin.P1, 0)
    control.waitMicros(2)
    pins.digitalWritePin(DigitalPin.P1, 1)
    control.waitMicros(10)
    pins.digitalWritePin(DigitalPin.P1, 0)
    
    // Read echo pulse duration (timeout after 30ms/~5m distance)
    const pulseDuration = pins.pulseIn(DigitalPin.P2, PulseValue.High, 30000)
    
    // If pulse duration is 0, sensor might be disconnected or malfunctioning
    if (pulseDuration === 0) {
        return -1 // Error indicator
    }
    
    // Calculate distance in cm (speed of sound = 343m/s = 34300cm/s)
    // Distance = (time × speed) ÷ 2 (round trip)
    // For microseconds: distance = (time × 0.0343) ÷ 2
    const rawDistance = (pulseDuration * 0.0343) / 2
    
    // Filter out unrealistically large values
    if (rawDistance > maxDistance) {
        return -2 // Out of range indicator
    }
    
    return rawDistance
}

// Function to get calibrated distance
function getCalibratedDistance(): number {
    const raw = getRawDistance()
    
    if (raw < 0) {
        return raw // Pass through error codes
    }
    
    return raw + calibrationOffset
}

// Set up radio
radio.setGroup(143)
radio.setTransmitPower(7)

// Show startup message
basic.showString("DIST")

// Main loop
basic.forever(function() {
    // Check if it's time for a new measurement
    if (input.runningTime() - lastMeasurementTime >= measurementInterval) {
        lastMeasurementTime = input.runningTime()
        
        // Get distance measurement
        distance = getCalibratedDistance()
        
        // Process and send the measurement
        if (distance >= 0) {
            // Valid measurement - show on display
            basic.clearScreen()
            
            // Scale for a 5x5 display (max 500cm shown)
            let displayValue = Math.min(25, Math.round(distance / 20))
            let x = displayValue % 5
            let y = Math.floor(displayValue / 5)
            led.plot(x, y)
            
            // Calculate checksum
            let values = [distance]
            let checksum = calculateChecksum(values)
            
            // Send measurement with checksum
            radio.sendString(convertToText(Math.round(distance)) + "," + convertToText(checksum))
            
            // Brief visual confirmation
            led.plot(2, 2)
        } else {
            // Error handling
            errorCount++
            
            if (distance === -1) {
                // Sensor connection issue
                basic.showIcon(IconNames.No)
            } else if (distance === -2) {
                // Out of range
                basic.showIcon(IconNames.SmallSquare)
            }
            
            // Send error code with checksum
            // Use error code 999 for sensor error
            let errorValue = 999
            let values = [errorValue]
            let checksum = calculateChecksum(values)
            radio.sendString(convertToText(errorValue) + "," + convertToText(checksum))
            
            basic.pause(500)
            basic.clearScreen()
        }
    }
    
    // Simple idle animation
    if (input.runningTime() % 1000 < 500) {
        led.plot(0, 0)
    } else {
        led.unplot(0, 0)
    }
    
    // Allow for other processing
    basic.pause(100)
})
