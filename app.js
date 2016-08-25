'use strict';
/* global process */
/* global __dirname */
/*******************************************************************************
 * Copyright (c) 2016 IBM Corp.
 * 
 * All rights reserved.
 * 
 * Created by the Financial Services Sector of the IBM Global Solutions Center
 * Based on the original work of David Huffman
 ******************************************************************************/

///////////////////////////////////////
/////////// Setup Node.js /////////////
var express 			= require('express');
var session 			= require('express-session');
var compression 		= require('compression');
var serve_static 		= require('serve-static');
var path 				= require('path');
var morgan 				= require('morgan');
var cookieParser 		= require('cookie-parser');
var bodyParser 			= require('body-parser');
var http 				= require('http');
var app 				= express();
var url 				= require('url');
var setup 				= require('./setup');
var fs 					= require('fs');
var cors 				= require('cors');

// Set Server Parameters
var host = setup.SERVER.HOST;
var port = setup.SERVER.PORT;

// Set chaincode variables
var peers 		= null;
var users 		= null;
var chaincode 	= null;

// Set chaincode source repository for Part B
//var chaincode_zip_url 	= "https://github.com/apiBlockchain/GscLabChaincode/archive/master.zip";
//var chaincode_unzip_dir   = "GscLabChaincode-master";
//var chaincode_git_url 	= "https://github.com/apiBlockchain/GscLabChaincode";

// Set chaincode source repository for Part C
var chaincode_zip_url 		= "https://github.com/apiBlockchain/GscLabChaincodePartC/archive/master.zip";
var chaincode_unzip_dir 	= "GscLabChaincodePartC-master";
var chaincode_git_url 		= "https://github.com/apiBlockchain/GscLabChaincodePartC";

////// Pathing and Module Setup ////////
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.engine('.html', require('jade').__express);
app.use(compression());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use('/cc/summary', serve_static(path.join(__dirname, 'cc_summaries'))); 
app.use(serve_static(path.join(__dirname, 'public'), {
	maxAge : '1d',
	setHeaders : setCustomCC
})); 


app.use(session({
	secret : 'Somethignsomething1234!test',
	resave : true,
	saveUninitialized : true
}));

function setCustomCC(res, path) {
	if (serve_static.mime.lookup(path) === 'image/jpeg')
		res.setHeader('Cache-Control', 'public, max-age=2592000'); 
	else if (serve_static.mime.lookup(path) === 'image/png')
		res.setHeader('Cache-Control', 'public, max-age=2592000');
	else if (serve_static.mime.lookup(path) === 'image/x-icon')
		res.setHeader('Cache-Control', 'public, max-age=2592000');
}


// Enable CORS preflight across the board.
app.options('*', cors());
app.use(cors());

// ---------------------
// Cache Busting Hash
// ---------------------
var bust_js = require('./busters_js.json');
var bust_css = require('./busters_css.json');
process.env.cachebust_js = bust_js['public/js/singlejshash']; 
process.env.cachebust_css = bust_css['public/css/singlecsshash']; 
console.log('cache busting hash js', process.env.cachebust_js, 'css',
		process.env.cachebust_css);

///////// Configure Webserver ///////////
app.use(function(req, res, next) {
	var keys;
	console.log('------------------------------------------ incoming request ------------------------------------------');
	console.log('New ' + req.method + ' request for', req.url);
	req.bag 		= {}; // create object for my stuff
	req.bag.session = req.session;

	var url_parts 	= url.parse(req.url, true);
	req.parameters 	= url_parts.query;
	keys 			= Object.keys(req.parameters);
	if (req.parameters && keys.length > 0)
		console.log({parameters : req.parameters}); 
	keys = Object.keys(req.body);
	if (req.body && keys.length > 0)
		console.log({body : req.body}); 
	next();
});


////// Blockchain service URL calls ////////

// Set the home page for the Open Points app by sending an html file
app.get('/', function(req, res) {

	var filePath = path.join(__dirname, '/public/openPoints/home.html');
	var homeFile = fs.readFile(filePath);

	fs.readFile(filePath, {encoding : 'utf-8'}, function(err, data) {
		
		if (!err) {

			// Determine if running on Bluemix or as a local app
			var hostnameForHtml = "";
			if (process.env.VCAP_APPLICATION) {
				var servicesObject 	= JSON.parse(process.env.VCAP_APPLICATION);
				hostnameForHtml 	= servicesObject.application_uris[0];
			} else {
				hostnameForHtml 	= "localhost:3000";
			}

			// Pass the hostname and chaincode source to the html file
			data = data.replace('#HOSTNAME#', hostnameForHtml);

			console.log('parsed html file succeeded');
			res.send(data);
		} else {
			console.log(err);
		}

	});
});


// Get all smart contracts from the blockchain
app.get('/getAllContracts', function(req, res) {

	//chaincode.query.getAllContracts([ 'getAllContracts', 'dummy_argument' ],
			//function(e, data) {
				//cb_received_response(e, data, res);
			//});
			
			
	chaincode.query.getAllContracts(['getAllContracts', 'dummy_argument'], function(e,data){	
			var jsonObj = "{\"array\":" + data + "}";
			cb_received_response(e,jsonObj,res);
		});

});



// Deploy the chaincode for part C of the lab using a url
//NOTE:  This functionality is not used during the lab
app.get('/deployPartC',function(req, res) {
	
	var ibc2 = new Ibc1();
	var options = {
			network : {
				peers : [ peers[0] ], 
				users : users, 
				options : {
					quiet : true,
					tls : true, 
					maxRetry : 1
				}
			},
			
			chaincode : {

				zip_url : 'https://github.com/apiBlockchain/GscLabChaincodePartC/archive/master.zip',
				unzip_dir : 'GscLabChaincodePartC-master', 
				git_url : 'https://github.com/apiBlockchain/GscLabChaincodePartC',
			}
	};

	// ---- Fire off SDK ---- //
	ibc2.load(options,function(err, cc) { 

		if (err != null) {
			console.log('! looks like an error loading the chaincode or network, app will fail\n',err);
			if (!process.error)
				process.error = {
					type : 'load',
					msg : err.details
			}; 
		} else {
			chaincode = cc; 


			if (!cc.details.deployed_name || cc.details.deployed_name === '') { 
				cc.deploy('init',[ '99' ], {save_path : './cc_summaries', delay_ms : 50000}, function(e) {
					check_if_deployed(e,1);
					res.send("Code deployed successfully!");
					});
			} else { 
				console.log('chaincode summary file indicates chaincode has been previously deployed');
				check_if_deployed(null, 1);
			}
		}
	});

});

// Transfer points in between members of the open points network
app.get('/transferPoints', function(req, res) {

	var toUser 		= url.parse(req.url, true).query.receiver;
	var fromUser 	= url.parse(req.url, true).query.sender;
	var type 		= url.parse(req.url, true).query.type;
	var description = url.parse(req.url, true).query.description;
	var contract 	= url.parse(req.url, true).query.contract;
	var amount 		= url.parse(req.url, true).query.amount;
	var money 		= url.parse(req.url, true).query.money;
	var activities 	= url.parse(req.url, true).query.activities;

	console.log('from: ', fromUser);
	console.log('to: ', toUser);
	console.log('contract is: ', contract);
	
	chaincode.invoke.transferPoints([ toUser, fromUser, type, description,
			contract, activities, amount, money ], cb_invoked_api); 

	res.send("success");

});

// Add a smart contract to the blockchain 
app.get('/addSmartContract', function(req, res) {

	var contractId 		= url.parse(req.url, true).query.contractid;
	var title 			= url.parse(req.url, true).query.title;
	var condition1 		= url.parse(req.url, true).query.condition1;
	var condition2 		= url.parse(req.url, true).query.condition2;
	var discountRate 	= url.parse(req.url, true).query.discountrate;

	console.log('contractId: ', contractId);
	console.log('title: ', title);
	console.log('condition1: ', condition1);
	console.log('condition2: ', condition2);
	console.log('discountRate: ', discountRate);
	
	chaincode.invoke.addSmartContract([ contractId, title, condition1,
			condition2, discountRate ], cb_invoked_api);

	res.send("success");

});


// Get a single participant's account information
app.get('/getCustomerPoints', function(req, res) {

	var userId = url.parse(req.url, true).query.userid;

	console.log('user: ', userId);

	chaincode.query.getUserAccount([ 'getUserAccount', userId ], function(e,data) {
		cb_received_response(e, data, res);
	});

});


// Get a single participant's transaction history
app.get('/getUserTransactions', function(req, res) {

	var userid = url.parse(req.url, true).query.userid;

	console.log('userid: ', userid);

	chaincode.query.getTxs([ 'getTxs', userid ], function(e, data) {
		cb_received_response(e, data, res);
	});

});


// Reset all of the data in the blockchain back to the original state 
app.get('/datareset', function(req, res) {

	
	chaincode.invoke.init(['99'], cb_invoked_api);

	res.send("Data reset function executed");

});

// Callback function for invoking a chaincode function
function cb_invoked_api(e, a) {
	console.log('response: ', e, a);
}

// Callback function for querying the chaincode
function cb_received_response(e, data, res) {
	if (e != null) {
		console.log('Received this error when calling a chaincode function', e);
	} else {
		console.log(JSON.stringify(data));
		if (res) {
			res.send(data);
		}

	}
}

////////////Error Handling //////////////
app.use(function(req, res, next) {
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});

app.use(function(err, req, res, next) { 
	console.log('Error Handeler -', req.url);
	var errorCode = err.status || 500;
	res.status(errorCode);
	req.bag.error = {
		msg : err.stack,
		status : errorCode
	};
	if (req.bag.error.status == 404)
		req.bag.error.msg = 'Sorry, I cannot locate that file';
	res.render('template/error', {
		bag : req.bag
	});
});

// ============================================================================================================================
// Launch Webserver
// ============================================================================================================================
var server = http.createServer(app).listen(port, function() {});

process.env.NODE_TLS_REJECT_UNAUTHORIZED 	= '0';
process.env.NODE_ENV 						= 'production';
server.timeout 								= 240000;

console.log('------------------------------------------ Server Up - ' + host
		+ ':' + port + ' ------------------------------------------');

if (process.env.PRODUCTION)
	console.log('Running using Production settings');
else
	console.log('Running using Developer settings');

//============================================================================================================================
// Deploy the chaincode to a blockchain service
//============================================================================================================================
var Ibc1 	= require('ibm-blockchain-js'); // rest based SDK for ibm blockchain
var ibc 	= new Ibc1();



// Load blockchain service peers manually, or from the Bluemix VCAP variable.
// Note: Bluemix peers will overwrite local peers!
try {
	//var manual 	= JSON.parse(fs.readFileSync('mycreds_BlockchainAug22.json','utf8'));
	//var manual 	= JSON.parse(fs.readFileSync('my_credsgsclabtest3.json','utf8'));
	var manual 	= JSON.parse(fs.readFileSync('my_credsgsclabtest3.json','utf8'));
	peers 		= manual.credentials.peers;
	users 		= null; // users are only found if security is on
	
	if (manual.credentials.users)
		users 	= manual.credentials.users;
	
	console.log('loading hardcoded users');
} catch (e) {
	console.log('Error - could not find hardcoded peers/users, this is okay if running in bluemix');
}

// Load peers from VCAP aka Bluemix Services
if (process.env.VCAP_SERVICES) { 
	var servicesObject = JSON.parse(process.env.VCAP_SERVICES);
	for ( var i in servicesObject) {
		if (i.indexOf('ibm-blockchain') >= 0) {
			if (servicesObject[i][0].credentials.error) {
				console.log('!\n!\n! Error from Bluemix: \n',
						servicesObject[i][0].credentials.error, '!\n!\n');
				peers = null;
				users = null;
				process.error = {
					type : 'network',
					msg : 'Due to overwhelming demand the IBM Blockchain Network service is at maximum capacity.  Please try recreating this service at a later date.'
				};
			}
			if (servicesObject[i][0].credentials
					&& servicesObject[i][0].credentials.peers) { 
				console.log(
						'overwritting peers, loading from a vcap service: ', i);
				peers = servicesObject[i][0].credentials.peers;
				if (servicesObject[i][0].credentials.users) {
					console.log('overwritting users, loading from a vcap service: ', i);
					users = servicesObject[i][0].credentials.users;
				} else
					users = null; // no security
				break;
			}
		}
	}
}

// Configure options for ibm-blockchain-js sdk only if a blockchain service with
// non-null peers has been found
if (peers != null) {
	
	var options = {
		network : {
			peers : [ peers[0] ], 
			users : users, 
			options : {
				quiet : true, 
				tls : true,
				maxRetry : 1
			}
		},
		chaincode : {
			zip_url :   chaincode_zip_url,
			unzip_dir : chaincode_unzip_dir,
			git_url :   chaincode_git_url,
		}
	};

	//if (process.env.VCAP_SERVICES) {
		//console.log('\n[!] looks like you are in bluemix, I am going to clear out the deploy_name so that it deploys new cc.\n[!] hope that is ok budddy\n');
		//options.chaincode.deployed_name = '';
	//}

	// Fire off SDK
	ibc.load(options, function(err, cc) {
		
		if (err != null) {
			console.log('! looks like an error loading the chaincode or network, app will fail\n', err);
			if (!process.error)
				process.error = {type : 'load',msg : err.details};
		} else {
			chaincode = cc; 

			//To Deploy or Not to Deploy
			if (!cc.details.deployed_name || cc.details.deployed_name === '') { 
				cc.deploy('init', [ '99' ], {save_path : './cc_summaries',delay_ms : 50000}, function(e) {
					check_if_deployed(e, 1);
				});
			} else { 
				console.log('chaincode summary file indicates chaincode has been previously deployed');
				check_if_deployed(null, 1);
			}
		}
	});

}

// Check if chaincode is up and running or not
function check_if_deployed(e, attempt) {
	if (e) {
		// Do nothing
		var x = 1;
	} else if (attempt >= 50) { 
		console.log('[preflight check]', attempt, ': failed too many times, giving up');
		var msg = 'chaincode is taking an unusually long time to start. this sounds like a network error, check peer logs';
		if (!process.error)
			process.error = {type : 'deploy',msg : msg};
	} else {
		console.log('[preflight check]', attempt, ': testing if chaincode is ready');
		chaincode.query.getUserAccount([ 'getUserAccount', "U2974034" ], function(err, resp) {
			
			var cc_deployed = false;
			try {
				if (err == null) { 
					
					if (resp === 'null')
						cc_deployed = true; 
					else {
						var json = JSON.parse(resp);
						if (json.UserId == "U2974034")
							cc_deployed = true; 
					}
				}
			} catch (e) {} 

			// ---- Are We Ready? ---- //
			if (!cc_deployed) {
				console.log('[preflight check]', attempt,': failed, trying again');
				setTimeout(function() {check_if_deployed(null, ++attempt); }, 10000);
			} else {
				console.log('[preflight check]', attempt, ': success');
				console.log("The app is ready to go!"); //yes, lets go!
			}
		});
	}
}