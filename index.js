var util=require('util');
var mqtt=require('mqtt');
var ModbusRTU = require("modbus-serial");
var Parser = require('binary-parser').Parser;
const commandLineArgs = require('command-line-args')
var errorCounter = 0;

const optionDefinitions = [
	{ name: 'mqtthost', alias: 'm', type: String, defaultValue: "localhost" },
	{ name: 'mqttclientid', alias: 'c', type: String, defaultValue: "huawei1Client" },
	{ name: 'inverterhost', alias: 'i', type: String},
	{ name: 'inverterport', alias: 'p', type: String},
        { name: 'address',      alias: 'a', type: Number, multiple: true, defaultValue: [1] },
        { name: 'wait',         alias: 'w', type: Number, defaultValue: 10000 },
        { name: 'debug',        alias: 'd', type: Boolean, defaultValue: false },
  ];

const options = commandLineArgs(optionDefinitions)

var HuaweiSerialNumber=[];
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

const SUNPayloadParser = new Parser()
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
	.int32be('PeakActivePowerDay') //32078
	.int32be('ActivePower') //32080
	.int32be('ReactivePower') //32082
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
function getSUNPayload(data) {
	return SUNPayloadParser.parse(data);
}


const getSUNSN = async (address) => {
	try {
		modbusClient.setID(address);
		let vals = await modbusClient.readHoldingRegisters(30015, 10);
		HuaweiSerialNumber[address] = new String(vals.buffer).replace(/\0/g, '');
		if(options.debug) {
			console.log("[" + HuaweiSerialNumber[address] + "]");
		}
		errorCounter = 0;
	} catch (e) {
		if(options.debug) {
			console.log(e);
		}
		errorCounter++;
		return null;
	}
}

const getSUNRegisters = async (address) => {
	try {
		modbusClient.setID(address);
                let vals = await modbusClient.readHoldingRegisters(32000, 116);	
		var gwState = getSUNPayload(vals.buffer);
		gwState.PV1Power = parseInt(gwState.PV1Voltage * gwState.PV1Current);
		gwState.PV2Power = parseInt(gwState.PV2Voltage * gwState.PV2Current);
		gwState.PV3Power = parseInt(gwState.PV3Voltage * gwState.PV3Current);
		gwState.PV4Power = parseInt(gwState.PV4Voltage * gwState.PV4Current);
		if(options.debug) {
			console.log(util.inspect(gwState));
		}
		sendMqtt(HuaweiSerialNumber[address], gwState);
		errorCounter = 0;
	} catch (e) {
		if(options.debug) {
			console.log(e);
		}
		errorCounter++;
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
                if(!HuaweiSerialNumber[meter]) {
			await getSUNSN(meter);
                }
                await sleep(100);
                if(HuaweiSerialNumber[meter]) {
			await getSUNRegisters(meter);
		}
		pos++;
        }
        if(errorCounter>30) {
        	console.log("too many errors - exiting");
        	process.exit(-1);
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

