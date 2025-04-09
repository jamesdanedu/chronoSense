// Function to map UV voltage in mV to UV index
function mapUVIndexFromVoltage (uvVoltage: number) {
    if (uvVoltage < 50) {
        return 0
    } else if (uvVoltage < 227) {
        return Math.round((uvVoltage - 50) / (227 - 50))
    } else if (uvVoltage < 318) {
        return 1 + Math.round((uvVoltage - 227) / (318 - 227))
    } else if (uvVoltage < 408) {
        return 2 + Math.round((uvVoltage - 318) / (408 - 318))
    } else if (uvVoltage < 503) {
        return 3 + Math.round((uvVoltage - 408) / (503 - 408))
    } else if (uvVoltage < 606) {
        return 4 + Math.round((uvVoltage - 503) / (606 - 503))
    } else if (uvVoltage < 696) {
        return 5 + Math.round((uvVoltage - 606) / (696 - 606))
    } else if (uvVoltage < 795) {
        return 6 + Math.round((uvVoltage - 696) / (795 - 696))
    } else if (uvVoltage < 881) {
        return 7 + Math.round((uvVoltage - 795) / (881 - 795))
    } else if (uvVoltage < 976) {
        return 8 + Math.round((uvVoltage - 881) / (976 - 881))
    } else if (uvVoltage < 1079) {
        return 9 + Math.round((uvVoltage - 976) / (1079 - 976))
    } else if (uvVoltage < 1170) {
        return 10 + Math.round((uvVoltage - 1079) / (1170 - 1079))
    } else {
        return 11
    }
}
let dataString = ""
let checksum = 0
let onesIndex = 0
let onesMv = 0
let uvIndex = 0
let uvValueInMv = 0
let uvValue = 0
radio.setGroup(143)
radio.setTransmitPower(7)
basic.showIcon(IconNames.Diamond)
/**
 * UV Sensor with UV Index Mapping for ChronoSense
 * 
 * Vout(mV)    UV Index
 * 
 * <50          0     (low)
 * 
 * 227          1
 * 
 * 318          2
 * 
 * 408          3
 * 
 * 503          4
 * 
 * 606          5
 * 
 * 696          6
 * 
 * 795          7
 * 
 * 881          8
 * 
 * 976          9
 * 
 * 1079         10
 * 
 * 1170         11+   (extreme)
 */
basic.forever(function () {
    uvValue = pins.analogReadPin(AnalogPin.P0)
    // Convert analog reading (0-1023) to millivolts (0-3300)
    uvValueInMv = Math.round(uvValue * 3300 / 1023)
    // Calculate UV index from voltage
    uvIndex = mapUVIndexFromVoltage(uvValueInMv)
    basic.showIcon(IconNames.SmallDiamond)
    // Calculate checksum using the modSum method from ChronoSense
    // Extract the ones digit from each value
    onesMv = Math.abs(Math.round(uvValueInMv)) % 10
    onesIndex = Math.abs(Math.round(uvIndex)) % 10
    // Add them together and take the ones digit
    checksum = (onesMv + onesIndex) % 10
    // Format data string with UV value in mV, UV index, and checksum
    // Ensuring all values are properly converted to text
    dataString = "" + convertToText(uvValueInMv) + "," + convertToText(uvIndex) + "," + convertToText(checksum)
    // Send data over radio
    radio.sendString(dataString)
    // Display UV index (more relevant than the raw mV value)
    basic.showNumber(uvIndex)
    basic.pause(200)
    basic.showIcon(IconNames.Diamond)
    basic.pause(1000)
})
