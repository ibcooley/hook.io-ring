var util = require('util'),
	Hook = require('hook.io').Hook,
	HashRing = require('hashring');

var RingClient = module.exports = function RingClient(options) {
	var self = this;

	// handle options
	options || (options = {});
	self.ringFamily = options.family || 'default';
	options.name || (options.name = self.ringFamily + '-ring-client');

	// call super
	Hook.call(self, options);

	// keyed by name
	self.nodeMap = {};
	// for fast round-robin assignments
	self.nodes = [];
	self.nodeIndex = -1;
	// for key-based assignments
	self.ring = new HashRing([], 'md5');

	self.on('hook::ready', function() {
		self.init(self.initClient.bind(self));
	});
};
util.inherits(RingClient, Hook);

// override this to provide your own initialization logic - just be sure to invoke done() when you're... done
RingClient.prototype.init = function(done) { done(); };

RingClient.prototype.initClient = function() {
	var self = this;
	self.initNodes();
	self.on('*::' + self.ns('new'), function(node) {
		self.addNode(node);
	});
	self.on('hook::disconnected', function(server) {
		self.removeNode(server.disconnected.name);
	});
};

RingClient.prototype.initNodes = function() {
	var self = this;
	self.nodeMap = {};
	self.nodes.length = 0;
	self.nodeIndex = -1;
	self.emit(self.ns('find'), function(err, node) {
		if (err) return console.error('Error in ' + self.ns('find') + ' reply', err);
		self.addNode(node);
	});
};

RingClient.prototype.addNode = function(node) {
	// todo: maybe we should update the node if it already exists...
	if (this.nodeMap[node.name]) return;
	this.nodes.push(node);
	this.nodeMap[node.name] = node;
	this.ring.addServer(node.name);
	this.log(this, '[Node Added, ' + this.nodes.length + ' total]', node, this);
};

RingClient.prototype.removeNode = function(nodeName) {
	if (!this.nodeMap[nodeName]) return;
	for (var i = 0, len = this.nodes.length; i < len; i++) {
		if (this.nodes[i].name === nodeName) {
			this.nodes.splice(i, 1);
			break;
		}
	}
	delete this.nodeMap[nodeName];
	this.ring.removeServer(nodeName);
	this.log(this, '[Node Removed, ' + this.nodes.length + ' remaining]', nodeName, this);
};

RingClient.prototype.getNode = function(key) {
	if (!this.nodes.length) return null;
	if (key) {
		// use hash ring
		var nodeName = this.ring.getNode(key);
		if (!nodeName) throw new Error('No node was found for the provided key!');
		return this.nodeMap[nodeName];
	} else {
		// use round robin
		if (++this.nodeIndex >= this.nodes.length) this.nodeIndex = 0;
		return this.nodes[this.nodeIndex];
	}
};

RingClient.prototype.ns = function(eventName) {
	return this.ringFamily + '-ring' + (eventName ? '::' + eventName : '');
};
