'use strict';

// Naive implementation, not optimized.
// Highly likely to be a throw-away so the major concern is simplicity.

var debug_match_params = !!process.env.NGS_DEBUG_PARAMS;
var debug_delay = !!process.env.NGS_DEBUG_DELAY;

var util = require('util');
var native_methods = require('./vm-native-methods');
var data = require('./vm-data');

var Args = native_methods.Args;

for(var k in data) {
	global[k] = data[k];
}

function ReturnLater() {}

function Return(v) { this.v = v; }


function _repr_depth(depth) {
	var ret = '';
	for(var i=0;i<depth;i++) {
		ret = ret + '  ';
	}
	return ret;
}


function inspect(x, depth) {
	depth = depth || 0;
	var t = get_type(x);
	var pfx = _repr_depth(depth);
	if(t == 'Number') {
		return pfx + get_num(x) + '\n';
	}
	if(t == 'String') {
		return pfx + '"' + get_str(x) + '"\n';
	}
	if(t == 'Array') {
		var ret = pfx + '[\n'
		var a = get_arr(x);
		for(var i=0; i<a.length; i++) {
			ret = ret + inspect(a[i], depth+1);
		}
		ret = ret + pfx + ']\n'
		return ret;
	}
	if(t == 'Lambda') {
		var l = get_arr(get_lmb(x))
		var params = get_arr(l[1]);
		var s = [];
		var pt;
		for(var i=0; i<params.length; i++) {
			// TODO: arg_rest_pos & friends representation
			var param_type = get_type(get_arr(params[i])[2]);
			if(param_type == 'Null') {
				pt = '';
			} else {
				pt = ':' + get_str(get_arr(params[i])[2]);
			}
			s.push(get_str(get_arr(params[i])[0]) + pt);
		}
		var code;
		if(get_type(l[2]) == 'NativeMethod') {
			code = 'native:' + l[2][1].name;
		} else {
			code = '@' + get_num(l[2]);
		}
		return pfx + '<Lambda '+ code +'(' +s.join(', ') + ')>\n';
		// console.log(params, );
	}
	if(t == 'Bool') {
		return pfx + String(get_boo(x)) + '\n';
	}
	if(t == 'Null') {
		return pfx + 'null\n';
	}
	return _repr_depth(depth) + '<' + t + '>\n';
}

function inspect_stack(stack) {
	var ret = [];
	for(var i=0; i<stack.length; i++) {
		ret = ret + String(i) + ': ' + inspect(stack[i]);
	}
	return ret;
}

function Frame() {
	return this.initialize();
}

Frame.prototype.initialize = function() {
	this.ip = 0;
	this.scopes = [];
}

function Context(global_scope) {
	return this.initialize(global_scope);
}

Context.prototype.initialize = function(global_scope) {

	this.state = 'running';
	this.stack = [];

	this.frame = new Frame();
	this.frame.scopes = [global_scope];
	this.frames = [this.frame];
	this.cycles = 0;

	var get_context_ip = function() {
		return this.frame.ip;
	}.bind(this);

	// Don't want pop() method to be listed and printed in console.log()
	Object.defineProperty(this.stack, 'pop', {
		'value': function vm_pop() {
			if(this.length == 0) {
				throw new Error("Stack underflow at " + (get_context_ip()-1));
			}
			return Array.prototype.pop.call(this);
		}
	});

	native_methods.register_native_methods.call(this);
	this.registerNativeMethod('inspect', native_methods.Args().pos('x', null).get(), function vm_inspect_p_any(scope) {
		return ['String', inspect(scope.x)];
	});

	return this;
}

Context.prototype.find_var_lexical_scope = function(varname) {
	var scopes = this.frame.scopes;
	for(var i=scopes.length-1; i>=0; i--) {
		if(Object.prototype.hasOwnProperty.call(scopes[i], varname)) {
			return [true, scopes[i]];
		}
	}
	// console.log(scopes[0]);
	return [false, scopes[0]];
}

Context.prototype.get_var = function(name) {
	var r = this.find_var_lexical_scope(name);
	if(!r[0]) {
		throw new Error("Using undefined variable '" + name + "'");
	}
	return r[1][name];
}

Context.prototype.set_var = function(name, val) {
	var var_scope = this.find_var_lexical_scope(name);
	if(var_scope[0]) {
		// Found: set it. Maybe change later to assign to local anyway
		var_scope[1][name] = val;
		return;
	}
	var scopes = this.frame.scopes;
	scopes[scopes.length-1][name] = val;

}

Context.prototype.getCallerLexicalScopes = function() {
	// Should only be exposed to internal functions for security reasons.
	return this.frames[this.frames.length-2].scopes;
}

function VM() {
	return this.initialize();
}

VM.prototype.initialize = function() {
	this.code = [];
	this.global_scope = {};
	this.types = {};
	this.runnable_contexts = [];
	this.suspended_contexts = [];
	this.finished_contexts = [];
	this.context = null;

	return this;
}

VM.prototype.useCode = function(c) {
	// TODO: assert that there are no cotext pointing to existing this.code
	//		 (which is being replaced)
	this.code.pop(); // remove the halt that we've added
	this.code = this.code.concat(c);
	this.code.push(['halt']);
	return this;
}

VM.prototype.useCodeWithRet = function(c) {
	var ptr = this.code.length;
	this.code = this.code.concat(c);
	this.code.push(['ret']);
	return ptr;
}

VM.prototype.setupContext = function() {
	var c = new Context(this.global_scope);
	this.runnable_contexts.push(c);
	return c;
}

VM.prototype.start = function(finished_callback) {
	this.finished_callback = finished_callback;
	this.mainLoop();
}

VM.prototype.mainLoop = function() {
	var stack_debug = process.env.NGS_DEBUG_STACK;
	while(this.runnable_contexts.length) {
		// console.log('DEBUG DELAY PRE', this.runnable_contexts.length);
		this.context = this.runnable_contexts[0];

		if(typeof(this.context.frame.ip) == 'string') {
			var f = this.context[this.context.frame.ip];
			f.call(this.context);
			continue;
		}

		var op = this.code[this.context.frame.ip];
		this.context.frame.ip++;
		if(stack_debug) {
			console.log('ST', inspect_stack(this.context.stack));
			console.log('FRAMES_N', this.context.frames.length);
			console.log('OP', op, '@', this.context.frame.ip-1, 'CYCLES', this.context.cycles);
			console.log('');
		}
		if(op[0] === 'comment') {
			continue;
		}
		if(!(op[0] in this.opcodes)) {
			throw new Error("Illegal opcode: " + op[0] + " at " + (this.context.frame.ip-1));
		}
		this.opcodes[op[0]].call(this, op[1]);
		this.context.cycles++;
		// Here, we might be with another stack, ip, etc

		// Warning: in future, some operations might change `this.context`
		if(debug_delay && this.context.state === 'running') {
			console.log('DEBUG DELAY', this.runnable_contexts.length);
			var ctx = this.context;
			this.suspend_context();
			setTimeout(function() {
				if(ctx.state === 'suspended') {
					// console.log('CALLING UNSUSPEND_CONTEXT');
					this.unsuspend_context(ctx);
				}
			}.bind(this), 100);
			break;
		}
	}
	if(!this.runnable_contexts.length && !this.suspended_contexts.length) {
		this.finished_callback(this);
	}
}

VM.prototype.suspend_context = function() {
	// console.log('DEBUG DELAY B', this.runnable_contexts.length);
	var ctx = this.runnable_contexts.shift();
	if(!ctx) {
		throw new Error("VM.suspend_context: no runnable contexts.");
	}
	ctx.state = 'suspended';
	this.suspended_contexts.push(ctx);
	// console.log('suspend_context', ctx);
}

VM.prototype.unsuspend_context = function(ctx) {
	// console.log('UNSUSPEND_CONTEXT', ctx);
	var i = this.suspended_contexts.indexOf(ctx);
	if(i === -1) {
		if(this.runnable_contexts.indexOf(ctx) !== -1) {
			console.warn("VM.unsuspend_context() on context which is already runnable: " + ctx);
		} else {
			throw new Error("VM.unsuspend_context() on context which is not suspended: " + ctx);
		}
	}
	this.suspended_contexts.splice(i, 1);
	ctx.state = 'running';
	this.runnable_contexts.push(ctx);
	setTimeout(function() {
		this.mainLoop();
	}.bind(this), 0);
}

Context.prototype.registerMethod = function(name, f) {
	var r = this.find_var_lexical_scope(name);
	if(!r[0]) {
		r[1][name] = ['Array', [f]];
		return;
	}
	r[1][name][1].push(f);
}

Context.prototype.registerNativeMethod = function(name, args, f) {
	var m =
		[
			'Lambda',
			[
				'Array',
				[
					['Scopes', this.frame.scopes], // Maybe change later and give access to the global scope. Simplicity for now.
					args,
					['NativeMethod', f],
				]
			]
		];
	this.registerMethod(name, m);
}

function match_params(lambda, args, kwargs) {
	var l = get_lmb(lambda); // ['Lambda', ['Array', [SCOPES, ARGS, IP]]]
	var l = get_arr(l);
	if(l[1] instanceof Args) {
		throw new Error("You forgot to use .get() in the end of Args().x().y().z() sequence when defining: " + l)
	}
	var params = get_arr(l[1]);
	var scope = {};
	var positional_idx = 0;
	if(debug_match_params) {
		console.log('match_params args', args);
		console.log('match_params kwargs', kwargs);
		console.log('match_params params', util.inspect(params, {depth: 20}));
	}

	var p = get_arr(args);
	var n = get_hsh(kwargs);
	for(var i=0; i<params.length; i++) {
		var cur_param = get_arr(params[i]);
		var cur_param_name = get_str(cur_param[0]);
		var cur_param_mode = get_str(cur_param[1]);
		var cur_param_type;

		if(cur_param_mode === 'arg_rest_pos') {
			scope[cur_param_name] = ['Array', p.slice(i)];
			positional_idx += (p.length - i);
			break;
		}
		if(get_type(cur_param[2]) !== 'Null') {
			cur_param_type = get_str(cur_param[2]);
		} else {
			cur_param_type = null;
		}
		// console.log('params', i, cur_param_name, cur_param_mode);
		if(cur_param_mode == 'arg_pos') {
			if(p.length-1 < positional_idx) {
				return [false, {}, 'not enough pos args'];
			}
			if(cur_param_type) {
				if(get_type(p[positional_idx]) !== cur_param_type) {
					return [false, {}, 'pos args type mismatch at ' + positional_idx];
				}
			}
			scope[cur_param_name] = p[positional_idx++];
		}
	}
	if(p.length > positional_idx) {
		return [false, {}, 'too much pos args'];
	}
	return [true, scope, 'all matched'];
}

Context.prototype.invoke_or_throw = function(methods, args, kwargs, vm) {
	var status = this.invoke(methods, args, kwargs, vm);
	if(!status[0]) {
		console.log(args);
		throw new Error("Invoke: appropriate method for " + inspect(args) + " and " + inspect(kwargs) + " not found for in " + inspect(methods));
	}
}


Context.prototype.invoke = function(methods, args, kwargs, vm) {
	var ms;
	if(get_type(methods) == 'Lambda') {
		ms = [methods]
	} else {
		ms = get_arr(methods);
	}

	for(var l=ms.length-1, i=l; i>=0; i--) {
		var m = ms[i];

		var lambda = get_arr(get_lmb(m));
		// 0:scopes, 1:args, 2:ip/native_func
		var scope = match_params(m, args, kwargs);
		if(!scope[0]) {
			continue;
		}
		var call_type = get_type(lambda[2]);

		// __super, __args, __kwargs for new frame
		// TODO: make these invalid arguments
		var vars = scope[1];
		vars['__super'] = ['Array', ms.slice(0, ms.length-1)];
		vars['__args'] = args;
		vars['__kwargs'] = kwargs;

		var old_frame = this.frame;
		this.frame = new Frame();
		this.frames.push(this.frame);
		this.frame.scopes = get_scp(lambda[0]).concat(vars)
		old_frame.stack_len = this.stack.length;

		if(call_type === 'Number') {
			this.frame.ip = get_num(lambda[2]);
			return [true];
		}
		if(call_type === 'NativeMethod') {
			var nm = get_nm(lambda[2]);
			// console.log('NATIVEMETHOD', nm);
			try {
				this.stack.push(nm.call(this, scope[1], vm));
				this.ret(1);
			} catch(e) {
				if(e instanceof ReturnLater) {
					// all good
				} else {
					throw e;
				}
			}
			return [true];
		}
		throw new Error("Don't know how to call matched method: " + m);
	}

	return [false, 'no_method'];

}

Context.prototype.ret = function(stack_delta) {
	this.frames.pop();
	this.frame = this.frames[this.frames.length - 1];
	if(stack_delta === null) {
	} else {
		if(this.stack.length != this.frame.stack_len + stack_delta) {
			console.log('STACK', this.stack.length, this.frame.stack_len, stack_delta);
			throw new Error("Returning with wrong stack size");
		}
	}
}

Context.prototype.guard = function(vm) {
	var methods = this.get_var('__super');
	var args = this.get_var('__args');
	var kwargs = this.get_var('__kwargs');
	this.ret(0);
	var m = get_arr(methods);
	this.invoke_or_throw(methods, args, kwargs, vm);
}

VM.prototype.opcodes = {

	'halt': function() {
		this.context.state = 'finished';
		this.finished_contexts.push(this.runnable_contexts.shift());
	},

	// stack: ... -> ... value
	'push': function(v) {
		// ideally v is a scalar
		this.context.stack.push(v);
	},

	// stack: ... -> ... ip of the next instruction
	'push_ip': function(v) {
		this.context.stack.push(['Number', this.context.frame.ip]);
	},

	'push_num': function(v) { this.context.stack.push(['Number', v]); },
	'push_str': function(v) { this.context.stack.push(['String', v]); },
	'push_arr': function(v) { this.context.stack.push(['Array', []]); },
	'push_hsh': function(v) { this.context.stack.push(['Hash', {}]); },
	'push_nul': function(v) { this.context.stack.push(['Null', null]); },
	'push_boo': function(v) { this.context.stack.push(['Bool', v]); },

	// stack: ... value -> ...
	'pop': function() {
		this.context.stack.pop();
	},

	// stack: ... x -> ... x x
	'dup': function() {
		var st = this.context.stack;
		var v = st.pop();
		st.push(v);
		st.push(v);
	},

	'xchg': function() {
		var st = this.context.stack;
		var v1 = st.pop();
		var v2 = st.pop();
		st.push(v1);
		st.push(v2);
	},

	// stack: ... var_name -> ... var_value
	'get_var': function() {
		var st = this.context.stack;
		var name = get_str(st.pop());
		this.context.stack.push(this.context.get_var(name));
	},

	// stack: ... value varname -> ...
	'set_var': function() {
		var st = this.context.stack;
		var name = st.pop();
		var val = st.pop();
		name = get_str(name);
		this.context.set_var(name, val);
	},

	// stack: ... args kwargs methods -> ... X
	'invoke': function() {
		var st = this.context.stack;
		var methods = st.pop();
		var kwargs = st.pop();
		var args = st.pop();
		this.context.invoke_or_throw(methods, args, kwargs, this);
	},

	// stack: ... arg1 arg2 methods -> ... X
	'invoke2': function() {
		var st = this.context.stack;
		var methods = st.pop();
		var arg2 = st.pop();
		var arg1 = st.pop();
		var args = ['Array', [arg1, arg2]];
		this.context.invoke_or_throw(methods, args, ['Hash', {}], this);
	},
	'invoke3': function() {
		var st = this.context.stack;
		var methods = st.pop();
		var arg3 = st.pop();
		var arg2 = st.pop();
		var arg1 = st.pop();
		var args = ['Array', [arg1, arg2, arg3]];
		this.context.invoke_or_throw(methods, args, ['Hash', {}], this);
	},

	// stack: ... v -> ... v
	'ret': function() {
		var c = this.context;
		if(c.frames[c.frames.length-2].stack_len === c.stack.length) {
			// We need to return a value but there isn't one in the stack
			// return Null in these rare cases.
			c.stack.push(['Null', null]);
		}
		this.context.ret(1);
	},

	// guard: ... v
	'guard': function() {
		var v = get_boo(this.context.stack.pop())
		if(v) {
			return;
		}
		this.context.guard(this);
	},

	'jump': function(offset) {
		this.context.frame.ip += offset;
	},

	'jump_if_true': function(offset) {
		var v = this.context.stack.pop();
		if(get_boo(v)) {
			this.context.frame.ip += offset;
		}
	},

	'jump_if_false': function(offset) {
		var v = this.context.stack.pop();
		if(!get_boo(v)) {
			this.context.frame.ip += offset;
		}
	},
};


exports.VM = VM;