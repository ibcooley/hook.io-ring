var util = require('util'),
	os = require('os'),
	Hook = require('hook.io').Hook;

var RingNode = module.exports = function RingNode(options) {
	var self = this;

	// handle options
	options || (options = {});
	self.ringFamily = options.family || 'default';
	options.name || (options.name = self.ringFamily + '-ring-node');

	// call super
	Hook.call(self, options);

	// override init() to specify your own config values
	self.configValues = null;

	self.on('hook::ready', function() {
		self.init(function(err, configValues) {
			if (err)
				return self.emit('error', err);
			self.configValues = configValues || self.getDefaultConfigValues();
			self.afterInit();
		});
	});
};
util.inherits(RingNode, Hook);

// override this to provide your own initialization logic - just be sure to invoke done() when you're... done
// to specify your own config values, pass them to done(): e.g., done(null, { foo: 'bar' })
RingNode.prototype.init = function(done) { done(); };

RingNode.prototype.afterInit = function() {
	var self = this;
	self.emit(self.ns('new'), self.describe());
	// todo: is this rebinding each time we reconnect, or are the old registered event listeners lost
	// when we disconnected?
	self.on('*::' + self.ns('find'), function(data, reply) {
		reply(null, self.describe());
	});
};

RingNode.prototype.describe = function() {
	return {
		name: this.name,
		config: this.configValues || {}
	};
};

RingNode.prototype.getDefaultConfigValues = function() {
	var address = this.guessAddress();
	if (!address) throw new Error('Unable to locate a valid address for client config. Override getClientConfig() to provide your own values.');
	return { address: address };
};

RingNode.prototype.guessAddress = function() {
	var interfaces = os.networkInterfaces(),
		nameTest = RegExp.prototype.test.bind(/^(?:en|eth)\d$/),
		possibleAddresses = Object.keys(interfaces)
			.filter(nameTest)
			.map(function(name) { return interfaces[name]; })
			.reduce(function(prev,cur) { return prev.concat(cur); }, [])
			.filter(function(ipset) { return ipset.family === 'IPv4' && !ipset.internal; })
			.map(function(ipset) { return ipset.address; });

	return possibleAddresses[0] || null;
};

RingNode.prototype.ns = function(eventName) {
	return this.ringFamily + '-ring' + (eventName ? '::' + eventName : '');
};

//
// Thoughts on how to manage inheritance and sync/async initialization and configuration setting..
//
// Ideally subclassing hooks could react to an event (e.g., 'hook::ready') and either synchronously
// or asynchronously do any initialization logic and configuration value setting.
// When the subclassing hook is done, it could emit a new event (e.g., `SomeHook::ns('config', configValues)`)
// or notify some function (e.g., `setConfig(configValues)`). Following initialization / configuration setting,
// the 'new' event could then be emitted
//
