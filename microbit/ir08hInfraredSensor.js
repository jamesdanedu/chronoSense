/**
 * Global variables
 */
// Function to calculate checksum using modSum approach
function calculateChecksum (values: any[]) {
    for (let value of values) {
        // Add ones digit of each absolute value to sum
        sum += Math.abs(Math.round(value)) % 10
    }
    // Return ones digit of sum
    return sum % 10
}
// milliseconds to debounce sensor readings
// Button A: Display current detection count
input.onButtonPressed(Button.A, function () {
    basic.showString("CNT:")
    basic.showNumber(detectionCount)
    basic.pause(1000)
    basic.clearScreen()
})
// Button A+B: Display current state
input.onButtonPressed(Button.AB, function () {
    if (currentState == 0) {
        // Obstacle detected
        basic.showString("OBS")
    } else {
        // Clear
        basic.showString("CLR")
    }
    basic.pause(1000)
    basic.clearScreen()
})
// Button B: Reset detection count
input.onButtonPressed(Button.B, function () {
    detectionCount = 0
    basic.showString("RST")
    basic.pause(500)
    basic.clearScreen()
})
let checksum2 = 0
let values2: number[] = []
let checksum = 0
let values: number[] = []
let lastDetectionTime = 0
let currentTime = 0
let previousState = 0
let currentState = 0
let detectionCount = 0
let sum = 0
// milliseconds to debounce sensor readings
let debounceDelay = 100
// Setup radio communication
radio.setGroup(144)
radio.setTransmitPower(7)
// Configure the digital pin with pull-up resistor
// This ensures stable readings when no obstacle is present
pins.setPull(DigitalPin.P0, PinPullMode.PullUp)
// Show startup message
basic.showString("IR")
basic.pause(500)
basic.clearScreen()
// Main program loop
basic.forever(function () {
    // Read the IR sensor state
    // 0 = obstacle detected, 1 = no obstacle
    currentState = pins.digitalReadPin(DigitalPin.P0)
    // Check for state change (obstacle detected or removed)
    if (currentState != previousState) {
        // Debounce: only register if state has been stable for debounceDelay
        currentTime = input.runningTime()
        if (currentTime - lastDetectionTime > debounceDelay) {
            // If we transitioned from clear (1) to obstacle detected (0)
            if (currentState == 0 && previousState == 1) {
                detectionCount += 1
                // Visual feedback for obstacle detection
                basic.showLeds(`
                    # # # # #
                    # . . . #
                    # . # . #
                    # . . . #
                    # # # # #
                    `)
                // Calculate checksum
                values = [currentState, detectionCount]
                checksum = calculateChecksum(values)
                // Send data: state,count,checksum
                radio.sendString("" + currentState + "," + detectionCount + "," + checksum)
                basic.pause(200)
            } else {
                // Obstacle removed (transitioned from 0 to 1)
                basic.showLeds(`
                    . . . . .
                    . # # # .
                    . # # # .
                    . # # # .
                    . . . . .
                    `)
                // Calculate checksum
                values2 = [currentState, detectionCount]
                checksum2 = calculateChecksum(values2)
                // Send data: state,count,checksum
                radio.sendString("" + currentState + "," + detectionCount + "," + checksum2)
                basic.pause(200)
            }
            // Update state tracking variables
            previousState = currentState
            lastDetectionTime = currentTime
        }
    } else {
        // State unchanged - show current status with minimal display
        if (currentState == 0) {
            // Obstacle present - show a dot
            led.plot(2, 2)
        } else {
            // No obstacle - clear display
            basic.clearScreen()
        }
    }
    // Brief delay between readings
    basic.pause(50)
})
