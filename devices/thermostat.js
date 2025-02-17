const RingSocketDevice = require('./base-socket-device')

class Thermostat extends RingSocketDevice {
    constructor(deviceInfo, operatingStatus, temperatureSensor) {
        super(deviceInfo)
        this.deviceData.mdl = 'Thermostat'
        this.operatingStatus = operatingStatus
        this.temperatureSensor = temperatureSensor

        this.entity.thermostat = {
            component: 'climate',
            fan_modes: this.device.data.hasOwnProperty('supportedFanModes')
                ? this.device.data.supportedFanModes.map(f => f.charAt(0).toUpperCase() + f.slice(1))
                : ["Auto"],
        }

        this.data = {
            mode: (() => { return this.device.data.mode === 'aux' ? 'heat' : this.device.data.mode }),
            fanMode: (() => { return this.device.data.fanMode.replace(/^./, str => str.toUpperCase()) }),
            auxMode: (() => { return this.device.data.mode === 'aux' ? 'ON' : 'OFF' }),
            setPoint: (() => {
                return this.device.data.setPoint
                    ? this.device.data.setPoint.toString()
                    : this.temperatureSensor.data.celsius.toString() 
                }),
            operatingMode: (() => { 
                return this.operatingStatus.data.operatingMode !== 'off'
                    ? `${this.operatingStatus.data.operatingMode}ing`
                    : this.device.data.mode === 'off'
                        ? 'off'
                        : this.device.data.fanMode === 'on' ? 'fan' : 'idle' 
                }),
            temperature: (() => { return this.temperatureSensor.data.celsius.toString() })
        }

        this.operatingStatus.onData.subscribe(() => { 
            if (this.isOnline()) { 
                this.publishOperatingMode()
                this.publishAttributes()
            }
        })

        this.temperatureSensor.onData.subscribe(() => {
            if (this.isOnline()) { 
                this.publishTemperature()
                this.publishAttributes()
            }
        })
    }

    async publishData(data) {
        const isPublish = data === undefined ? true : false

        this.publishMqtt(this.entity.thermostat.mode_state_topic, this.data.mode())
        this.publishMqtt(this.entity.thermostat.temperature_state_topic, this.data.setPoint())
        this.publishMqtt(this.entity.thermostat.fan_mode_state_topic, this.data.fanMode())
        this.publishMqtt(this.entity.thermostat.aux_state_topic, this.data.auxMode())
        this.publishOperatingMode()

        if (isPublish) { this.publishTemperature() }
        this.publishAttributes()
    }

    publishOperatingMode() {
        this.publishMqtt(this.entity.thermostat.action_topic, this.data.operatingMode())
    }

    publishTemperature() {
        this.publishMqtt(this.entity.thermostat.current_temperature_topic, this.data.temperature())
    }

    // Process messages from MQTT command topic
    processCommand(message, componentCommand) {
        switch (componentCommand) {
            case 'thermostat/mode_command':
                this.setMode(message)
                break;
            case 'thermostat/temperature_command':
                this.setSetPoint(message)
                break;
            case 'thermostat/fan_mode_command':
                this.setFanMode(message)
                break;
            case 'thermostat/aux_command':
                this.setAuxMode(message)
                break;
            default:
                this.debug(`Received message to unknown command topic: ${componentCommand}`)
        }
    }

    async setMode(value) {
        this.debug(`Received set mode ${value}`)
        const mode = value.toLowerCase()
        switch(mode) {
            case 'off':
                this.publishMqtt(this.entity.thermostat.action_topic, mode)
            case 'cool':
            case 'heat':
            case 'aux':
                this.device.setInfo({ device: { v1: { mode } } })
                this.publishMqtt(this.entity.thermostat.mode_state_topic, mode)
                break;
            default:
                this.debug(`Received invalid set mode command`)
        }
    }
    
    async setSetPoint(value) {
        this.debug(`Received set target temperature to ${value}`)
        if (isNaN(value)) {
            this.debug('New target temperature received but not a number!')
        } else if (!(value >= 10 && value <= 37.22223)) {
            this.debug('New target command received but out of range (10-37.22223°C)!')
        } else {
            this.device.setInfo({ device: { v1: { setPoint: Number(value) } } })
            this.publishMqtt(this.entity.thermostat.temperature_state_topic, value)
        }
    }

    async setFanMode(value) {
        this.debug(`Recevied set fan mode ${value}`)
        const fanMode = value.toLowerCase()
        if (this.entity.thermostat.fan_modes.map(e => e.toLocaleLowerCase()).includes(fanMode)) {
            this.device.setInfo({ device: { v1: { fanMode }}})
            this.publishMqtt(this.entity.thermostat.fan_mode_state_topic, fanMode.replace(/^./, str => str.toUpperCase()))
        } else {
            this.debug('Received invalid fan mode command')
        }
    }

    async setAuxMode(value) {
        this.debug(`Received set aux mode ${value}`)
        const auxMode = value.toLowerCase()
        switch(auxMode) {
            case 'on':
            case 'off':
                const mode = auxMode === 'on' ? 'aux' : 'heat'
                this.device.setInfo({ device: { v1: { mode } } })
                this.publishMqtt(this.entity.thermostat.aux_state_topic, auxMode.toUpperCase())
                break;
            default:
                this.debug('Received invalid aux mode command')
        }
    }
}

module.exports = Thermostat