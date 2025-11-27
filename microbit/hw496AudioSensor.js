/**
 * HW-496 Audio Sensor Module for micro:bit
 * 
 * For use with ChronoSense data acquisition application
 * 
 * Hardware Connections:
 * - VCC: Connect to 3.3V
 * - GND: Connect to GND
 * - AO (Analog Output): Connect to P0 (analog sound level)
 * - DO (Digital Output): Connect to P1 (sound detected trigger)
 * 
 * Features:
 * - Real-time sound level monitoring (0-1023 range)
 * - Sound event detection (when threshold exceeded)
 * - Adjustable sensitivity via onboard potentiometer
 * - Checksum validation for data integrity
 * 
 * The HW-496 module has an onboard potentiometer to adjust the
 * sensitivity threshold for the digital output.
 */

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
let soundLevel = 0
let soundDetected = 0
let maxSoundLevel = 0
let soundEventCount = 0
let lastEventTime = 0
let isMonitoring = true

// Debounce time for digital sound detection (milliseconds)
const DEBOUNCE_TIME = 100

// Button A: Reset event counter and max level
input.onButtonPressed(Button.A, function() {
    soundEventCount = 0
    maxSoundLevel = 0
    basic.showIcon(IconNames.Yes)
    basic.pause(500)
    basic.clearScreen()
})

// Button B: Toggle between detailed and simple monitoring modes
input.onButtonPressed(Button.B, function() {
    isMonitoring = !isMonitoring
    
    if (isMonitoring) {
        basic.showString("ON")
    } else {
        basic.showString("OFF")
    }
    basic.pause(500)
    basic.clearScreen()
})

// Button A+B: Show current statistics
input.onButtonPressed(Button.AB, function() {
    basic.showString("E:")
    basic.showNumber(soundEventCount)
    basic.pause(500)
    basic.showString("M:")
    basic.showNumber(maxSoundLevel)
    basic.pause(500)
    basic.clearScreen()
})

// Setup radio communication
radio.setGroup(144)
radio.setTransmitPower(7)

// Configure digital input with pull-up resistor
pins.setPull(DigitalPin.P1, PinPullMode.PullUp)

// Show startup message
basic.showString("SOUND")
basic.pause(1000)
basic.clearScreen()

// Main loop
basic.forever(function() {
    if (isMonitoring) {
        // Read analog sound level (0-1023)
        soundLevel = pins.analogReadPin(AnalogPin.P0)
        
        // Read digital sound detection (0 = sound detected, 1 = quiet)
        // Note: Most modules use active LOW for detection
        soundDetected = pins.digitalReadPin(DigitalPin.P1) === 0 ? 1 : 0
        
        // Update maximum sound level
        if (soundLevel > maxSoundLevel) {
            maxSoundLevel = soundLevel
        }
        
        // Count sound events (with debouncing)
        if (soundDetected === 1) {
            const currentTime = input.runningTime()
            if (currentTime - lastEventTime > DEBOUNCE_TIME) {
                soundEventCount += 1
                lastEventTime = currentTime
                
                // Visual feedback for sound event
                basic.showIcon(IconNames.SmallDiamond)
                basic.pause(100)
                basic.clearScreen()
            }
        }
        
        // Prepare data array for transmission
        let values = [soundLevel, soundDetected, soundEventCount]
        
        // Calculate checksum
        let checksum = calculateChecksum(values)
        
        // Format data string: soundLevel,soundDetected,eventCount,checksum
        let dataString = "" + convertToText(soundLevel) + "," + 
                         convertToText(soundDetected) + "," + 
                         convertToText(soundEventCount) + "," + 
                         convertToText(checksum)
        
        // Send data over radio
        radio.sendString(dataString)
        
        // Visual representation of sound level on LED display
        // Map sound level to 0-25 for 5x5 display
        let displayLevel = Math.floor(soundLevel / 41)  // 1023 / 25 ≈ 41
        
        // Clear display
        basic.clearScreen()
        
        // Light up LEDs based on sound level
        for (let i = 0; i < displayLevel; i++) {
            let x = i % 5
            let y = Math.floor(i / 5)
            led.plot(x, y)
        }
        
        // Show special indicator if sound event detected
        if (soundDetected === 1) {
            led.plot(2, 2)
        }
        
        // Sampling interval
        basic.pause(200)
    } else {
        // Monitoring paused - show idle animation
        basic.showIcon(IconNames.Asleep)
        basic.pause(1000)
    }
})

/**
 * CLASSROOM NOTES:
 * 
 * Understanding the HW-496 Sensor:
 * - Analog Output (AO): Provides a continuous voltage level (0-3.3V)
 *   representing sound intensity. The micro:bit reads this as 0-1023.
 * 
 * - Digital Output (DO): Provides a binary signal (HIGH/LOW) when
 *   sound exceeds the threshold set by the onboard potentiometer.
 * 
 * Calibration:
 * - Adjust the onboard potentiometer with a small screwdriver
 * - Turn clockwise to increase sensitivity (trigger on quieter sounds)
 * - Turn counter-clockwise to decrease sensitivity
 * - The blue LED on the module lights up when sound is detected
 * 
 * Applications:
 * - Sound level monitoring in classrooms
 * - Noise pollution studies
 * - Voice-activated projects
 * - Music visualization
 * - Security/intrusion detection
 * 
 * Troubleshooting:
 * - If readings are always 0: Check wiring and power connections
 * - If readings are always maximum: Sensor may be too sensitive
 * - If digital output never triggers: Adjust potentiometer sensitivity
 * - For best results, position sensor away from direct wind/air flow
 */
