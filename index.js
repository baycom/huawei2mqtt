var util=require('util');
var mqtt=require('mqtt');
var ModbusRTU = require("modbus-serial");
var Parser = require('binary-parser').Parser;
const commandLineArgs = require('command-line-args')

const optionDefinitions = [
	{ name: 'mqtthost', alias: 'm', type: String, defaultValue: "localhost" },
	{ name: 'mqttclientid', alias: 'c', type: String, defaultValue: "goodwe1Client" },
	{ name: 'inverterhost', alias: 'i', type: String},
	{ name: 'inverterport', alias: 'p', type: String},
        { name: 'address',      alias: 'a', type: Number, multiple: true, defaultValue: [1] },
        { name: 'wait',         alias: 'w', type: Number, defaultValue: 10000 },
        { name: 'debug',        alias: 'd', type: Boolean, defaultValue: false },
  ];

const options = commandLineArgs(optionDefinitions)

var GWSerialNumber=[];
var modbusClient = new ModbusRTU();

modbusClient.setTimeout(1000);

if(options.inverterhost) {
	modbusClient.connectTCP(options.inverterhost, { port: 502 }).catch((error) => {
		console.error(error);
		process.exit(-1);
	});
} else if(options.inverterport) {
	modbusClient.connectRTUBuffered(options.inverterport, { baudRate: 9600, parity: 'none' }).catch((error) => {
		console.error(error);
		process.exit(-1);
	});
}

console.log("MQTT Host         : " + options.mqtthost);
console.log("MQTT Client ID    : " + options.mqttclientid);
console.log("Huawei MODBUS addr: " + options.address);

if(options.inverterhost) {
	console.log("Huawei host       : " + options.inverterhost);
} else {
	console.log("Huawei serial port: " + options.inverterport);
}

var MQTTclient = mqtt.connect("mqtt://"+options.mqtthost,{clientId: options.mqttclientid});
	MQTTclient.on("connect",function(){	
	console.log("MQTT connected");
})

MQTTclient.on("error",function(error){
		console.log("Can't connect" + error);
		process.exit(1)
	});

function sendMqtt(id, data) {
        if(options.debug) {
	        console.log("publish: "+'Huawei/' + id, JSON.stringify(data));
	}
        MQTTclient.publish('Huawei/' + id, JSON.stringify(data));        
}

const ETPayloadParser = new Parser()
	.uint16be('State1') //32000
	.seek(2)
	.uint16be('State2') //32002
	.uint32be('State3') //32003-32004
	.seek((32008-32005)*2)
	.uint16be('Alarm1') //32008
	.uint16be('Alarm2') //32009
	.uint16be('Alarm3') //32010
	.seek((32016-32011)*2)
	.int16be('PV1Voltage', { formatter: (x) => {return x/10.0;}}) //32016
	.int16be('PV1Current', { formatter: (x) => {return x/100.0;}}) //32017
	.int16be('PV2Voltage', { formatter: (x) => {return x/10.0;}}) //32018
	.int16be('PV2Current', { formatter: (x) => {return x/100.0;}}) //32019
	.int16be('PV3Voltage', { formatter: (x) => {return x/10.0;}}) //32020
	.int16be('PV3Current', { formatter: (x) => {return x/100.0;}}) //32021
	.int16be('PV4Voltage', { formatter: (x) => {return x/10.0;}}) //32022
	.int16be('PV4Current', { formatter: (x) => {return x/100.0;}}) //32023
	.seek((32064-32024)*2)
	.int32be('InputPower') //32064
	.uint16be('L1L2Voltage', { formatter: (x) => {return x/10.0;}}) //32066
	.uint16be('L2L3Voltage', { formatter: (x) => {return x/10.0;}}) //32067
	.uint16be('L3L1Voltage', { formatter: (x) => {return x/10.0;}}) //32068
	.uint16be('L1Voltage', { formatter: (x) => {return x/10.0;}}) //32069
	.uint16be('L2Voltage', { formatter: (x) => {return x/10.0;}}) //32070
	.uint16be('L3Voltage', { formatter: (x) => {return x/10.0;}}) //32071
	.int32be('L1Current', { formatter: (x) => {return x/1000.0;}}) //32072
	.int32be('L2Current', { formatter: (x) => {return x/1000.0;}}) //32074
	.int32be('L3Current', { formatter: (x) => {return x/1000.0;}}) //32076
	.int32be('PeakActivePowerDay', { formatter: (x) => {return x/1000.0;}}) //32078
	.int32be('ActivePower', { formatter: (x) => {return x/1000.0;}}) //32080
	.int32be('ReactivePower', { formatter: (x) => {return x/1000.0;}}) //32082
	.int16be('PowerFactor', { formatter: (x) => {return x/1000.0;}}) //32084
	.uint16be('GridFrequency', { formatter: (x) => {return x/100.0;}}) //32085
	.uint16be('Efficiency', { formatter: (x) => {return x/100.0;}}) //32086
	.int16be('InternalTemperature', { formatter: (x) => {return x/10.0;}}) //32087
	.uint16be('InsulationResistance', { formatter: (x) => {return x/1000.0;}}) //32088
	.uint16be('DeviceStatus') //32089
	.uint16be('FaultCode') //32090
	.uint32be('StartupTime') //32091
	.uint32be('ShutdownTime') //32093
	.seek((32106-32095)*2)
	.uint32be('AccumulatedEnergyYield', { formatter: (x) => {return x/100.0;}}) //32106
	.seek((32114-32108)*2)	
	.uint32be('DailyEnergyYield', { formatter: (x) => {return x/100.0;}}) //32114
	;
function getETPayload(data) {
	return ETPayloadParser.parse(data);
}


const getETSN = async (address) => {
	try {
		modbusClient.setID(address);
		let vals = await modbusClient.readHoldingRegisters(30015, 10);
		GWSerialNumber[address] = new String(vals.buffer);
		if(options.debug) {
			console.log(GWSerialNumber);
		}
	} catch (e) {
		if(options.debug) {
			console.log(e);
		}
		return null;
	}
}

const getETRegisters = async (address) => {
	try {
		modbusClient.setID(address);
                let vals = await modbusClient.readHoldingRegisters(32000, 116);	
		var gwState = getETPayload(vals.buffer);
		if(options.debug) {
			console.log(util.inspect(gwState));
		}
//		sendMqtt(GWSerialNumber[address], gwState);
	} catch (e) {
		if(options.debug) {
			console.log(e);
		}
		return null;
	}
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getMetersValue = async (meters) => {
    try{
        var pos=0;
        // get value of all meters
        for(let meter of meters) {
                if(options.debug) {
                        console.log("query: " + meter);
                }
                if(!GWSerialNumber[meter]) {
			await getETSN(meter);
                }
                await sleep(100);
                if(GWSerialNumber[meter]) {
			await getETRegisters(meter);
		}
		pos++;
        }
	await sleep(options.wait);
    } catch(e){
        // if error, handle them here (it should not)
        console.log(e)
    } finally {
        // after get all data from salve repeate it again
        setImmediate(() => {
            getMetersValue(meters);
        })
    }
}

// start get value
getMetersValue(options.address);

