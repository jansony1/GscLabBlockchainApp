'use strict';
/* global process */
/* global __dirname */
/*******************************************************************************
 * Copyright (c) 2015 IBM Corp.
 *
 * All rights reserved. 
 *
 * Contributors:
 *   David Huffman - Initial implementation
 *******************************************************************************/
/////////////////////////////////////////
///////////// Setup Node.js /////////////
/////////////////////////////////////////
var express = require('express');
var session = require('express-session');
var compression = require('compression');
var serve_static = require('serve-static');
var path = require('path');
var morgan = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var http = require('http');
var app = express();
var url = require('url');
var setup = require('./setup');
var fs = require('fs');
var cors = require('cors');

//// Set Server Parameters ////
var host = setup.SERVER.HOST;
var port = setup.SERVER.PORT;

// Set chaincode variables
var peers = null;
var users = null;
var chaincode = null;

// Set chaincode source repository
var chaincode_zip_url = "https://github.com/apiBlockchain/GscLabChaincode/archive/master.zip";
var	chaincode_unzip_dir ="GscLabChaincode-master";						
var	chaincode_git_url = "https://github.com/apiBlockchain/GscLabChaincode";

// Set chaincode source repository for Part C
//var chaincode_zip_url = "https://github.com/apiBlockchain/GscLabChaincodePartC/archive/master.zip";
//var	chaincode_unzip_dir ="GscLabChaincodePartC-master";						
//var	chaincode_git_url = "https://github.com/apiBlockchain/GscLabChaincodePartC";		


// Quick test for api demo
//var chaincode_zip_url = "https://github.com/apiBlockchain/ApiEconomyDemoChaincode/archive/master.zip";
//var	chaincode_unzip_dir ="ApiEconomyDemoChaincode-master";						
//var	chaincode_git_url = "https://github.com/apiBlockchain/ApiEconomyDemoChaincode";	

////////  Pathing and Module Setup  ////////
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.engine('.html', require('jade').__express);
app.use(compression());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded()); 
app.use(cookieParser());
app.use('/cc/summary', serve_static(path.join(__dirname, 'cc_summaries')) );												//for chaincode investigator
app.use( serve_static(path.join(__dirname, 'public'), {maxAge: '1d', setHeaders: setCustomCC}) );							//1 day cache
//app.use( serve_static(path.join(__dirname, 'public')) );
app.use(session({secret:'Somethignsomething1234!test', resave:true, saveUninitialized:true}));
function setCustomCC(res, path) {
	if (serve_static.mime.lookup(path) === 'image/jpeg')  res.setHeader('Cache-Control', 'public, max-age=2592000');		//30 days cache
	else if (serve_static.mime.lookup(path) === 'image/png') res.setHeader('Cache-Control', 'public, max-age=2592000');
	else if (serve_static.mime.lookup(path) === 'image/x-icon') res.setHeader('Cache-Control', 'public, max-age=2592000');
}
// Enable CORS preflight across the board.
app.options('*', cors());
app.use(cors());

//---------------------
// Cache Busting Hash
//---------------------
var bust_js = require('./busters_js.json');
var bust_css = require('./busters_css.json');
process.env.cachebust_js = bust_js['public/js/singlejshash'];			//i'm just making 1 hash against all js for easier jade implementation
process.env.cachebust_css = bust_css['public/css/singlecsshash'];		//i'm just making 1 hash against all css for easier jade implementation
console.log('cache busting hash js', process.env.cachebust_js, 'css', process.env.cachebust_css);


///////////  Configure Webserver  ///////////
app.use(function(req, res, next){
	var keys;
	console.log('------------------------------------------ incoming request ------------------------------------------');
	console.log('New ' + req.method + ' request for', req.url);
	req.bag = {};																			//create object for my stuff
	req.bag.session = req.session;
	
	var url_parts = url.parse(req.url, true);
	req.parameters = url_parts.query;
	keys = Object.keys(req.parameters);
	if(req.parameters && keys.length > 0) console.log({parameters: req.parameters});		//print request parameters for debug
	keys = Object.keys(req.body);
	if (req.body && keys.length > 0) console.log({body: req.body});							//print request body for debug
	next();
});


// Set the landing page for the desktop app by sending an html file as a response
app.get('/', function(req, res){

	var filePath = path.join(__dirname, '/public/openPoints/home.html');
	var homeFile = fs.readFile(filePath); 

	fs.readFile(filePath, {encoding: 'utf-8'}, function(err,data){
    if (!err){
		
		var hostnameForHtml = "";
		if (process.env.VCAP_APPLICATION) {
			var servicesObject = JSON.parse(process.env.VCAP_APPLICATION);
			hostnameForHtml = servicesObject.application_uris[0];
		}	
		else {
			hostnameForHtml = "localhost:3000";
		}
		
		data = data.replace('#HOSTNAME#', hostnameForHtml);
		data = data.replace('#GITURL#', chaincode_git_url);
		
		console.log('parsed html file succeeded');
		res.send(data);
    }else{
        console.log(err);
    }

	});
});

// Set the landing page for Part C by sending an html file as a response
app.get('/', function(req, res){

	var filePath = path.join(__dirname, '/public/openPoints/homePartC.html');
	var homeFile = fs.readFile(filePath); 

	fs.readFile(filePath, {encoding: 'utf-8'}, function(err,data){
    if (!err){
		
		var hostnameForHtml = "";
		if (process.env.VCAP_APPLICATION) {
			var servicesObject = JSON.parse(process.env.VCAP_APPLICATION);
			hostnameForHtml = servicesObject.application_uris[0];
		}	
		else {
			hostnameForHtml = "localhost:3000";
		}
		
		data = data.replace('#HOSTNAME#', hostnameForHtml);
		console.log('parsed html file succeeded');
		res.send(data);
    }else{
        console.log(err);
    }

	});
});



// Get all smart contracts from the blockchain
app.get('/getAllContracts', function(req, res){
  

	chaincode.query.getAllContracts(['getAllContracts', 'dummy_argument'], function(e,data){
		cb_received_response(e,data,res);
	});
	

});



app.get('/deployPartC', function(req, res) {
	var ibc2 = new Ibc1();
	var options = 	{
					network:{
						peers: [peers[0]],																	//lets only use the first peer! since we really don't need any more than 1
						users: users,																		//dump the whole thing, sdk will parse for a good one
						options: {
									quiet: true, 															//detailed debug messages on/off true/false
									tls: true, 																//should app to peer communication use tls?
									maxRetry: 1																//how many times should we retry register before giving up
								}
					},
					chaincode:{
	
						zip_url: 'https://github.com/apiBlockchain/GscLabChaincodePartC/archive/master.zip',
						unzip_dir: 'GscLabChaincodePartC-master',									//subdirectroy name of chaincode after unzipped
						git_url: 'https://github.com/apiBlockchain/GscLabChaincodePartC',			//GO git http url

					}
				};


	// ---- Fire off SDK ---- //
																	//sdk will populate this var in time, lets give it high scope by creating it here
	ibc2.load(options, function (err, cc){														//parse/load chaincode, response has chaincode functions!
		if(err != null){
			console.log('! looks like an error loading the chaincode or network, app will fail\n', err);
			if(!process.error) process.error = {type: 'load', msg: err.details};				//if it already exist, keep the last error
		}
		else{
			chaincode = cc;														//pass the cc obj to part 2 node code

			// ---- To Deploy or Not to Deploy ---- //
			if(!cc.details.deployed_name || cc.details.deployed_name === ''){					//yes, go deploy
				cc.deploy('init', ['99'], {save_path: './cc_summaries', delay_ms: 50000}, function(e){ //delay_ms is milliseconds to wait after deploy for conatiner to start, 50sec recommended
					check_if_deployed(e, 1);
					res.send("Code deployed successfully!");
				});
			}
			else{																				//no, already deployed
				console.log('chaincode summary file indicates chaincode has been previously deployed');
				check_if_deployed(null, 1);
			}
		}
	});
	
	
	

});


// Transfer points in between members of the open points network
app.get('/transferPoints', function(req, res){
  
	var toUser = url.parse(req.url, true).query.receiver;
	var fromUser  = url.parse(req.url, true).query.sender;
	var type = url.parse(req.url, true).query.type;
	var description = url.parse(req.url, true).query.description;
	var contract = url.parse(req.url, true).query.contract;
	var amount = url.parse(req.url, true).query.amount;
	var money = url.parse(req.url, true).query.money;
	var activities = url.parse(req.url, true).query.activities;
	
	console.log('from: ', fromUser);
	console.log('to: ', toUser);
	console.log('contract is: ', contract);
	chaincode.invoke.transferPoints([toUser, fromUser, type, description,contract, activities, amount, money], cb_invoked_api);				//create a new paper


	res.send("success");
		

});

// Transfer points in between members of the open points network
app.get('/addSmartContract', function(req, res){
  
	var contractId = url.parse(req.url, true).query.contractid;
	var title  = url.parse(req.url, true).query.title;
	var condition1 = url.parse(req.url, true).query.condition1;
	var condition2 = url.parse(req.url, true).query.condition2;
	var discountRate = url.parse(req.url, true).query.discountrate;

	
	console.log('contractId: ', contractId);
	console.log('title: ', title);
	console.log('condition1: ', condition1);
	console.log('condition2: ', condition2);
	console.log('discountRate: ', discountRate);
	chaincode.invoke.addSmartContract([contractId, title, condition1, condition2, discountRate], cb_invoked_api);				//create a new paper


	res.send("success");
		

});

// Transfer points in between members of the open points network
app.get('/incrementReferenceNumber', function(req, res){
  
	var dummyvar = "1";

	chaincode.invoke.incrementReferenceNumber([dummyvar], cb_invoked_api);				//create a new paper


	res.send("success");
		

});



// Get a single member's account information
app.get('/getCustomerPoints', function(req, res){
  
	var userId = url.parse(req.url, true).query.userid;
	
	console.log('user: ',userId);
	
	chaincode.query.getUserAccount(['getUserAccount', userId], function(e,data){
		cb_received_response(e,data,res);
	});
	

});

// Get a single member's account information
app.get('/getReferenceNumber', function(req, res){
  
	var dummyVar = "1";
	
	
	chaincode.query.getReferenceNumber(['getReferenceNumber', dummyVar], function(e,data){
		cb_received_response(e,data,res);
	});
	

});


// Get a single member's transaction history
app.get('/getUserTransactions', function(req, res){
  
	var userid  = url.parse(req.url, true).query.userid;

	
	console.log('userid: ', userid);
	
	chaincode.query.getTxs(['getTxs', userid], function(e,data){
		cb_received_response(e,data,res);
	});	

});

// Callback function for invoking a chaincode function
function cb_invoked_api(e, a){
		console.log('response: ', e, a);
}

// Callback function for querying the chaincode
function cb_received_response(e,  data, res){
		if(e != null){
			console.log('Received this error when calling a chaincode function', e);
		}
		else{
			console.log(JSON.stringify(data));
			if(res){
				res.send(data);
			}
			
		}
}

////////////////////////////////////////////
////////////// Error Handling //////////////
////////////////////////////////////////////
app.use(function(req, res, next) {
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});
app.use(function(err, req, res, next) {														// = development error handler, print stack trace
	console.log('Error Handeler -', req.url);
	var errorCode = err.status || 500;
	res.status(errorCode);
	req.bag.error = {msg:err.stack, status:errorCode};
	if(req.bag.error.status == 404) req.bag.error.msg = 'Sorry, I cannot locate that file';
	res.render('template/error', {bag:req.bag});
});


// ============================================================================================================================
// 														Launch Webserver
// ============================================================================================================================
var server = http.createServer(app).listen(port, function() {});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_ENV = 'production';
server.timeout = 240000;																							// Ta-da.
console.log('------------------------------------------ Server Up - ' + host + ':' + port + ' ------------------------------------------');
if(process.env.PRODUCTION) console.log('Running using Production settings');
else console.log('Running using Developer settings');


// ============================================================================================================================
// 														Warning
// ============================================================================================================================

// ============================================================================================================================
// 														Entering
// ============================================================================================================================

// ============================================================================================================================
// 														Work Area
// ============================================================================================================================

var Ibc1 = require('ibm-blockchain-js');														//rest based SDK for ibm blockchain
var ibc = new Ibc1();

// ==================================
// load peers manually or from VCAP, VCAP will overwrite hardcoded list!
// ==================================
//this hard coded list is intentionaly left here, feel free to use it when initially starting out
//please create your own network when you are up and running


try{
	//var manual = JSON.parse(fs.readFileSync('mycreds_CtaBlockchainLab3.json', 'utf8'));
	//var manual = JSON.parse(fs.readFileSync('mycreds_myblockchain.json', 'utf8'));
	//var manual = JSON.parse(fs.readFileSync('mycreds_ApiBlockchainAug2.json', 'utf8'));
	var manual = JSON.parse(fs.readFileSync('mycreds_BlockchainAug15.json', 'utf8'));
	//var manual = JSON.parse(fs.readFileSync('mycreds_BlockchainAug16.json', 'utf8'));
	
	peers = manual.credentials.peers;
	console.log('loading hardcoded peers');
	users = null;																			//users are only found if security is on
	if(manual.credentials.users) users = manual.credentials.users;
	console.log('loading hardcoded users');
}
catch(e){
	console.log('Error - could not find hardcoded peers/users, this is okay if running in bluemix');
}

// ---- Load From VCAP aka Bluemix Services ---- //
if(process.env.VCAP_SERVICES){																	//load from vcap, search for service, 1 of the 3 should be found...
	var servicesObject = JSON.parse(process.env.VCAP_SERVICES);
	for(var i in servicesObject){
		if(i.indexOf('ibm-blockchain') >= 0){													//looks close enough
			if(servicesObject[i][0].credentials.error){
				console.log('!\n!\n! Error from Bluemix: \n', servicesObject[i][0].credentials.error, '!\n!\n');
				peers = null;
				users = null;
				process.error = {type: 'network', msg: 'Due to overwhelming demand the IBM Blockchain Network service is at maximum capacity.  Please try recreating this service at a later date.'};
			}
			if(servicesObject[i][0].credentials && servicesObject[i][0].credentials.peers){		//found the blob, copy it to 'peers'
				console.log('overwritting peers, loading from a vcap service: ', i);
				peers = servicesObject[i][0].credentials.peers;
				if(servicesObject[i][0].credentials.users){										//user field may or maynot exist, depends on if there is membership services or not for the network
					console.log('overwritting users, loading from a vcap service: ', i);
					users = servicesObject[i][0].credentials.users;
				} 
				else users = null;																//no security
				break;
			}
		}
	}
}


// Configure options for ibm-blockchain-js sdk only if a blockchain service with non-null peers has been found
if (peers != null) {
	var options = 	{
					network:{
						peers: [peers[0]],																	//lets only use the first peer! since we really don't need any more than 1
						users: users,																		//dump the whole thing, sdk will parse for a good one
						options: {
									quiet: true, 															//detailed debug messages on/off true/false
									tls: true, 																//should app to peer communication use tls?
									maxRetry: 1																//how many times should we retry register before giving up
								}
					},
					chaincode:{						
						zip_url: chaincode_zip_url,
						unzip_dir: chaincode_unzip_dir,					
						git_url:  chaincode_git_url,		
					}
				};
				
	if(process.env.VCAP_SERVICES){
		console.log('\n[!] looks like you are in bluemix, I am going to clear out the deploy_name so that it deploys new cc.\n[!] hope that is ok budddy\n');
		options.chaincode.deployed_name = '';
	}

	// ---- Fire off SDK ---- //
																	//sdk will populate this var in time, lets give it high scope by creating it here
	ibc.load(options, function (err, cc){														//parse/load chaincode, response has chaincode functions!
		if(err != null){
			console.log('! looks like an error loading the chaincode or network, app will fail\n', err);
			if(!process.error) process.error = {type: 'load', msg: err.details};				//if it already exist, keep the last error
		}
		else{
			chaincode = cc;														//pass the cc obj to part 2 node code

			// ---- To Deploy or Not to Deploy ---- //
			if(!cc.details.deployed_name || cc.details.deployed_name === ''){					//yes, go deploy
				cc.deploy('init', ['99'], {save_path: './cc_summaries', delay_ms: 50000}, function(e){ //delay_ms is milliseconds to wait after deploy for conatiner to start, 50sec recommended
					check_if_deployed(e, 1);
				});
			}
			else{																				//no, already deployed
				console.log('chaincode summary file indicates chaincode has been previously deployed');
				check_if_deployed(null, 1);
			}
		}
	});
	
	
}


//loop here, check if chaincode is up and running or not
function check_if_deployed(e, attempt){
	if(e){
		// Do nothing
		var x = 1;														
	}
	else if(attempt >= 50){																	//tried many times, lets give up and pass an err msg
		console.log('[preflight check]', attempt, ': failed too many times, giving up');
		var msg = 'chaincode is taking an unusually long time to start. this sounds like a network error, check peer logs';
		if(!process.error) process.error = {type: 'deploy', msg: msg};
	}
	else{
		console.log('[preflight check]', attempt, ': testing if chaincode is ready');
		chaincode.query.getUserAccount(['getUserAccount', "U2974034"], function(err, resp){
			var cc_deployed = false;
			try{
				if(err == null){															//no errors is good, but can't trust that alone
					if(resp === 'null') cc_deployed = true;									//looks alright, brand new
					else{
						var json = JSON.parse(resp);
						if(json.UserId == "U2974034") cc_deployed = true;					//looks alright
					}
				}
			}
			catch(e){}																		//anything nasty goes here

			// ---- Are We Ready? ---- //
			if(!cc_deployed){
				console.log('[preflight check]', attempt, ': failed, trying again');
				setTimeout(function(){
					check_if_deployed(null, ++attempt);										//no, try again later
				}, 10000);
			}
			else{
				console.log('[preflight check]', attempt, ': success');
				console.log("The app is ready to go!");														//yes, lets go!
			}
		});
	}
}