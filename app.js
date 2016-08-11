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

//// Router ////
app.use('/', require('./routes/site_router'));

app.get('/home', function(req, res){
   // res.sendfile('home.html', { root: __dirname + "/public/openPoints" } );
   
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
		//data = data.replace('#PORTNUMBER#', port);
		console.log('parsed html file succeeded');
		res.send(data);
    }else{
        console.log(err);
    }

	});
});


console.log("Server name export is: ", setup.SERVER.HOST + ":" +  setup.SERVER.PORT);

app.get('/getAllContracts', function(req, res){
  


	
	//console.log('Calling getAllContracts from blockchain ');

	//chaincode.query(['getNVAccounts', "BANKA"], cb_got_nv_accounts_api);
	
	//chaincode.query(['getAllContracts', 'dummy_argument'], function(e,data){
		//cb_got_nv_accounts_api(e,data,res);
	//});

	chaincode.query.getAllContracts(['getAllContracts', 'dummy_argument'], function(e,data){
		cb_got_nv_accounts_api(e,data,res);
	});
	
	
	//chaincode.query.read(['_marbleindex'], cb_got_index);
	//res.send("success");  //success response
		

});

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

	//chaincode.query(['getNVAccounts', "BANKA"], cb_got_nv_accounts_api);
	//chaincode.query(['getUserAccount', user], cb_got_nv_accounts_api);

	res.send("success");  //success response
		

});


app.get('/getAppUrl', function(req, res){
  
// ---- Load From VCAP aka Bluemix Services ---- //
if(process.env.VCAP_APPLICATION){																	//load from vcap, search for service, 1 of the 3 should be found...
	var servicesObject = JSON.parse(process.env.VCAP_APPLICATION);

	res.send(servicesObject.application_uris[0]);  //success response
		
}

else {
	
	res.send("No app URL found");
}

});




app.get('/getCustomerPoints', function(req, res){
  
	var userId = url.parse(req.url, true).query.userid;
	
	console.log('user: ',userId);
	
	//chaincode.query(['getNVAccounts', "BANKA"], cb_got_nv_accounts_api);
	
	chaincode.query.getUserAccount(['getUserAccount', userId], function(e,data){
		cb_got_nv_accounts_api(e,data,res);
	});

	
	//res.send("success");  //success response
		

});


app.get('/getUserTransactions', function(req, res){
  
	var userid  = url.parse(req.url, true).query.userid;

	
	console.log('userid: ', userid);

	//chaincode.query(['getNVAccounts', "BANKA"], cb_got_nv_accounts_api);
	
	chaincode.query.getTxs(['getTxs', userid], function(e,data){
		cb_got_nv_accounts_api(e,data,res);
	});

	
	//res.send("success");  //success response
		

});


function cb_invoked_api(e, a){
		console.log('response: ', e, a);
}
function cb_got_nv_accounts_api(e,  nvAccounts, res){
		if(e != null){
			console.log('Got NV Accounts error', e);
		}
		else{
			console.log(JSON.stringify(nvAccounts));
			//sendMsg({msg: 'nvAccounts', nvAccounts: nvAccounts});
			if(res){
				res.send(nvAccounts);
			}
			
		}
}


			//got the marble index, lets get each marble
function cb_got_index(e, index){
				if(e != null) console.log('marble index error:', e);
				else{
					try{
						var json = JSON.parse(index);
						for(var i in json){
							console.log('!', i, json[i]);
							chaincode.query.read([json[i]], cb_got_marble);					//iter over each, read their values
						}
					}
					catch(e){
						console.log('marbles index msg error:', e);
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
// 														Deployment Tracking
// ============================================================================================================================
console.log('- Tracking Deployment');
require('cf-deployment-tracker-client').track();		//reports back to us, this helps us judge interest! feel free to remove it


// ============================================================================================================================
// ============================================================================================================================
// ============================================================================================================================
// ============================================================================================================================
// ============================================================================================================================
// ============================================================================================================================

// ============================================================================================================================
// 														Warning
// ============================================================================================================================

// ============================================================================================================================
// 														Entering
// ============================================================================================================================

// ============================================================================================================================
// 														Work Area
// ============================================================================================================================
var part1 = require('./utils/ws_part1');														//websocket message processing for part 1
var part2 = require('./utils/ws_part2');														//websocket message processing for part 2
var ws = require('ws');																			//websocket mod
var wss = {};
var Ibc1 = require('ibm-blockchain-js');														//rest based SDK for ibm blockchain
var ibc = new Ibc1();

// ==================================
// load peers manually or from VCAP, VCAP will overwrite hardcoded list!
// ==================================
//this hard coded list is intentionaly left here, feel free to use it when initially starting out
//please create your own network when you are up and running

var peers = null;
var users = null;
var chaincode = null;	
try{
	//var manual = JSON.parse(fs.readFileSync('mycreds_CtaBlockchainLab1.json', 'utf8'));
	var manual = JSON.parse(fs.readFileSync('mycreds_CtaBlockchainLab3.json', 'utf8'));
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

if (peers != null) {
	
	// ==================================
// configure options for ibm-blockchain-js sdk
// ==================================
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
						//zip_url: 'https://github.com/ibm-blockchain/marbles-chaincode/archive/master.zip',
						//unzip_dir: 'marbles-chaincode-master/hyperledger/part2',							//subdirectroy name of chaincode after unzipped
						//git_url: 'https://github.com/ibm-blockchain/marbles-chaincode/hyperledger/part2',	//GO get http url
			
			
						zip_url: 'https://github.com/apiBlockchain/CtaBlockchainLab/archive/master.zip',
						unzip_dir: 'CtaBlockchainLab-master',									//subdirectroy name of chaincode after unzipped
						git_url: 'https://github.com/apiBlockchain/CtaBlockchainLab',			//GO git http url
						

						//zip_url: 'https://github.com/apiBlockchain/apiBlockchainRebuild/archive/master.zip',
						//unzip_dir: 'apiBlockchainRebuild-master',									//subdirectroy name of chaincode after unzipped
						//git_url: 'https://github.com/apiBlockchain/apiBlockchainRebuild',			//GO git http url
			
						//zip_url: 'https://github.com/apiBlockchain/nv-chaincode/archive/master.zip',
						//unzip_dir: 'nv-chaincode-master',									//subdirectroy name of chaincode after unzipped
						//git_url: 'https://github.com/apiBlockchain/nv-chaincode',			//GO git http url
					
					
						//hashed cc name from prev deployment, comment me out to always deploy, uncomment me when its already deployed to skip deploying again
						//deployed_name: '8c5677016abb7b4885b8dc40bb5b28f1554888cd766e2c945bc61bca03b349092f19197d32785254c692c9210db34c31821efc89e8a9f4dcb3f5575bebb4584b'
						//deployed_name: '8c5677016abb7b4885b8dc40bb5b28f1554888cd766e2c945bc61bca03b349092f19197d32785254c692c9210db34c31821efc89e8a9f4dcb3f5575bebb4584b'
						
						// Standard marbles BC
						//deployed_name: '50d9a2b4f93eb520b48f750b174dd90a8c4e5bf9836ee37e56d67fccccabe303ac95d3d299185215fbe90eef70a668363a3c7edd500e83f333c2af06dc0b1557'
					
					   // Lab BC - CtaBlockchainLab1
					   //deployed_name: '1342acdbcc60936f7f5ec84baee7a38e9b378011be88e96067b69d31b29ff39fdb4c8781ded06be581ab480d5db67995bfd0d681fcff836e4e7f74a1dd4f22ae'
					  //   deployed_name: 'b83303cd4dcd2e4a465839440758d2a3ef87e84a5f1f6bf7d2812141d0da7c64355fc8728c637a589f1027bb924601737181d038fa79ef782a138556e1b9d7b8'
					
					
					//Lab BC - CtaBlockchainLab3
					 //deployed_name: '72caf19e3ef2eaf72466516e6dac06b4c692bbf3ae097c5d26d886e098c16f344e69dc0eae1bbd4ffe2813e2a99e76d27fe43c359960b9ea66d5e6df866c3b55'
					deployed_name: '3b1ef936af680f22dc14f4682ac5cfef719bc77ebda5c67f4dff3b8cd63b93af4ce488944d9df74cdefdc1d3c0ad99b5d82753d8c0a80cbdefc460ab6877a5b5'
					
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
		chaincode = cc;
		part1.setup(ibc, cc);																//pass the cc obj to part 1 node code
		part2.setup(ibc, cc);																//pass the cc obj to part 2 node code

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
		cb_deployed(e);																		//looks like an error pass it along
	}
	else if(attempt >= 30){																	//tried many times, lets give up and pass an err msg
		console.log('[preflight check]', attempt, ': failed too many times, giving up');
		var msg = 'chaincode is taking an unusually long time to start. this sounds like a network error, check peer logs';
		if(!process.error) process.error = {type: 'deploy', msg: msg};
		cb_deployed(msg);
	}
	else{
		console.log('[preflight check]', attempt, ': testing if chaincode is ready');
		chaincode.query.read(['_marbleindex'], function(err, resp){
			var cc_deployed = false;
			try{
				if(err == null){															//no errors is good, but can't trust that alone
					if(resp === 'null') cc_deployed = true;									//looks alright, brand new, no marbles yet
					else{
						var json = JSON.parse(resp);
						if(json.constructor === Array) cc_deployed = true;					//looks alright, we have marbles
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
				cb_deployed(null);															//yes, lets go!
			}
		});
	}
}

// ============================================================================================================================
// 												WebSocket Communication Madness
// ============================================================================================================================
function cb_deployed(e){
	if(e != null){
		//look at tutorial_part1.md in the trouble shooting section for help
		console.log('! looks like a deploy error, holding off on the starting the socket\n', e);
		if(!process.error) process.error = {type: 'deploy', msg: e.details};
	}
	else{
		console.log('------------------------------------------ Websocket Up ------------------------------------------');
		
		wss = new ws.Server({server: server});												//start the websocket now
		wss.on('connection', function connection(ws) {
			ws.on('message', function incoming(message) {
				console.log('received ws msg:', message);
				try{
					var data = JSON.parse(message);
					part1.process_msg(ws, data);											//pass the websocket msg to part 1 processing
					part2.process_msg(ws, data);											//pass the websocket msg to part 2 processing
				}
				catch(e){
					console.log('ws message error', e);
				}
			});
			
			ws.on('error', function(e){console.log('ws error', e);});
			ws.on('close', function(){console.log('ws closed');});
		});
		
		wss.broadcast = function broadcast(data) {											//send to all connections
			wss.clients.forEach(function each(client) {
				try{
					client.send(JSON.stringify(data));
				}
				catch(e){
					console.log('error broadcast ws', e);
				}
			});
		};
		
		// ========================================================
		// Monitor the height of the blockchain
		// ========================================================
		ibc.monitor_blockheight(function(chain_stats){										//there is a new block, lets refresh everything that has a state
			if(chain_stats && chain_stats.height){
				console.log('hey new block, lets refresh and broadcast to all', chain_stats.height-1);
				ibc.block_stats(chain_stats.height - 1, cb_blockstats);
				wss.broadcast({msg: 'reset'});
				chaincode.query.read(['_marbleindex'], cb_got_index);
				chaincode.query.read(['_opentrades'], cb_got_trades);
			}
			
			//got the block's stats, lets send the statistics
			function cb_blockstats(e, stats){
				if(e != null) console.log('blockstats error:', e);
				else {
					chain_stats.height = chain_stats.height - 1;							//its 1 higher than actual height
					stats.height = chain_stats.height;										//copy
					wss.broadcast({msg: 'chainstats', e: e, chainstats: chain_stats, blockstats: stats});
				}
			}
			
			//got the marble index, lets get each marble
			function cb_got_index(e, index){
				if(e != null) console.log('marble index error:', e);
				else{
					try{
						var json = JSON.parse(index);
						for(var i in json){
							console.log('!', i, json[i]);
							chaincode.query.read([json[i]], cb_got_marble);					//iter over each, read their values
						}
					}
					catch(e){
						console.log('marbles index msg error:', e);
					}
				}
			}
			
			//call back for getting a marble, lets send a message
			function cb_got_marble(e, marble){
				if(e != null) console.log('marble error:', e);
				else {
					try{
						wss.broadcast({msg: 'marbles', marble: JSON.parse(marble)});
					}
					catch(e){
						console.log('marble msg error', e);
					}
				}
			}
			
			//call back for getting open trades, lets send the trades
			function cb_got_trades(e, trades){
				if(e != null) console.log('trade error:', e);
				else {
					try{
						trades = JSON.parse(trades);
						if(trades && trades.open_trades){
							wss.broadcast({msg: 'open_trades', open_trades: trades.open_trades});
						}
					}
					catch(e){
						console.log('trade msg error', e);
					}
				}
			}
		});
	}
}
