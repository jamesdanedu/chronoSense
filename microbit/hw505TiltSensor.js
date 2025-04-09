// Function to calculate tilt angle using accelerometer
function getTiltAngle() {
    // Get accelerometer values
    x = input.acceleration(Dimension.X)
    y = input.acceleration(Dimension.Y)
    z = input.acceleration(Dimension.Z)
    // Calculate the magnitude of acceleration
    tilt = Math.sqrt(x * x + y * y + z * z)
    // Normalize to a 0-100 scale for easier reading
    tiltNormalized = Math.min(100, Math.max(0, tilt / 20))
    return Math.round(tiltNormalized)
}

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

// Button A - Show current tilt value
input.onButtonPressed(Button.A, function() {
    basic.showNumber(tiltValue)
    basic.pause(1000)
    basic.clearScreen()
})

// Button B - Reset and recalibrate
input.onButtonPressed(Button.B, function() {
    basic.showString("RESET")
    isShaking = false
    maxTilt = 0
    basic.clearScreen()
})

let shakeDuration = 0
let shakeStartTime = 0
let tiltTriggered = false
let rawTilt = 0
let maxTilt = 0
let isShaking = false
let tiltValue = 0
let tiltNormalized = 0
let tilt = 0
let z = 0
let y = 0
let x = 0

radio.setGroup(143)

// Earthquake Detection System for micro:bit
// Variables for earthquake detection
let previousReading = 0

// Setup pin for tilt sensor
pins.setPull(DigitalPin.P1, PinPullMode.PullUp)

// Main program loop
basic.forever(function() {
    rawTilt = pins.digitalReadPin(DigitalPin.P1)
    // Read the tilt sensor from pin1 (inverted because tilt switches are often active LOW)
    tiltTriggered = !(rawTilt)
    
    // Get accelerometer tilt value for magnitude
    tiltValue = getTiltAngle()
    
    // Check if we've detected shaking
    if (tiltTriggered && !(isShaking)) {
        // Start of shake event
        isShaking = true
        shakeStartTime = input.runningTime()
        maxTilt = tiltValue
        
        // Visual indicator of shake start
        basic.showArrow(ArrowNames.North)
    }
    
    // If we're in a shake event, track its progress
    if (isShaking) {
        // Update maximum tilt detected
        maxTilt = Math.max(maxTilt, tiltValue)
        
        // If the tilt sensor is no longer triggered, end the shake event
        if (!(tiltTriggered)) {
            isShaking = false
            shakeDuration = input.runningTime() - shakeStartTime
            
            // Values to send
            let values = [tiltValue, shakeDuration, maxTilt]
            
            // Calculate checksum
            let checksum = calculateChecksum(values)
            
            // Send data with checksum
            radio.sendString("" + tiltValue + "," + shakeDuration + "," + maxTilt + "," + checksum)
            
            // Visual feedback based on intensity
            if (maxTilt > 80) {
                // Severe
                basic.showIcon(IconNames.Skull)
            } else if (maxTilt > 50) {
                // Moderate
                basic.showIcon(IconNames.Sad)
            } else {
                // Mild
                basic.showIcon(IconNames.Happy)
            }
            
            // Keep the icon visible briefly
            basic.pause(1000)
            basic.clearScreen()
        }
    }
    
    // Always output the current tilt value for continuous monitoring
    if (!(isShaking)) {
        // Values for regular monitoring
        let values = [tiltValue, 0, 0]
        
        // Calculate checksum
        let checksum = calculateChecksum(values)
        
        // Send data with checksum
        radio.sendString("" + tiltValue + "," + "0" + "," + "0" + "," + checksum)
    }
    
    // Sample rate - adjust as needed
    basic.pause(100)
})
