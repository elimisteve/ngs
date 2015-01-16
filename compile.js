'use strict';
// apt-get install node-pegjs # 0.7.0
// pegjs syntax.pegs

var util = require('util');

var _ = require('underscore');

var parser = require('./syntax');

var PUSH_NODES = {
	'number': true,
	'string': true,
	'bool': true,
	'null': true
};

var CALL_NODES = {
	'get_item': true,
	'set_item': true
}


function fix_binops(tree) {
	if((!tree[1]) || (!tree.same_precedence_binops_p(tree[1]))) {
		return tree.map(fix_binops);
	}
	var ret = tree[1];
	tree[1] = ret[0];
	ret[0] = tree;
	return fix_binops(ret);
}

function dup_if_needed(code, leave_value_in_stack) {
	if(leave_value_in_stack) {
		return code.concat([
			['comment', 'leave_value_in_stack', true],
			['dup']
		]);
	}
	return code;
}

function null_if_needed(code, leave_value_in_stack) {
	if(leave_value_in_stack) {
		return code.concat([
			['comment', 'leave_value_in_stack', true],
			['push_nul']
		]);
	}
	return code;
}

function pop_if_needed(code, leave_value_in_stack) {
	if(!leave_value_in_stack) {
		return code.concat([
			['comment', 'leave_value_in_stack', false],
			['pop']
		]);
	}
	return code;
}

function compile_invoke_no_args(method_name) {
	return [
		['push_arr'],
		['push_hsh'],
		['push_str', method_name],
		['get_var'],
		['invoke'],
	];
}

function compile_invoke_pos_args_in_stack(method_name) {
	return [
		['push_hsh'],
		['push_str', method_name],
		['get_var'],
		['invoke'],
	];
}

function compile_push() {
	return [
		['push_str', 'push'],
		['get_var'],
		['invoke2'],
	];
}

function process_break(code, delta) {
	for(var i=0; i<code.length; i++) {
		if(code[i] === '$BREAK') {
			code[i] = ['jump', code.length - i - 1 /* from next instruction */ + delta];
		}
	}
}

function process_continue(code, delta) {
	for(var i=0; i<code.length; i++) {
		if(code[i] === '$CONTINUE') {
			code[i] = ['jump', - i - 1 /* from next instruction */ + delta];
		}
	}
}

function transform_args(node) {
	if(!node.is('parameters')) {
		throw new Error('transform_args() must handle "parameters" nodes only');
	}
	var ret = [['push_arr']];
	node.forEach(function(n) {
		if(n[0]) {
			var param_type =
				[
					['push_str', n[0].data]
				]
		} else {
			var param_type =
				[
					['push_nul']
				]
		};
		// console.log('XXX', n, param_type);
		ret = ret.concat(
			[
				['push_arr'],
				['push_str', n.data],
			],
			compile_push(),
			[
				['push_str', n.node_type], // mode: arg_pos, arg_rest_pos, arg_rest_kw
			],
			compile_push(),
			param_type,
			compile_push(),
			compile_push()
		)
	})
	return ret;
}

function compile_tree(node, leave_value_in_stack) {
	var ret = [];
	if(leave_value_in_stack === undefined) {
		leave_value_in_stack = 1;
	}
	// console.log('node', node, leave_value_in_stack);
	if(node.is('assignment')) {
		if(node[0].is('varname')) {
			var rhs = dup_if_needed(compile_tree(node[1], true), leave_value_in_stack);
			return rhs.concat([
				['push_str', node[0].data],
				['set_var'],
			]);
		}
		throw new Error("Assignment to type " + node[0] + " is not implemented");
	}
	if(node.is('commands') || node.is('top_level_expressions')) {
		for(var i=0; i<node.length; i++) {
			var lvis = (i == node.length-1) && leave_value_in_stack;
			var t = compile_tree(node[i], lvis);
			// console.log('IN', node[i], 'OUT', t);
			ret = ret.concat(t);
		}
		return ret;
	}
	if(node.is('if')) {
		ret = ret.concat([
			['push_arr'],
		]);
		ret = ret.concat(compile_tree(node[0], true)); // condition
		ret = ret.concat(
			compile_push(),
			compile_invoke_pos_args_in_stack('Bool')
		);
		var t = compile_tree(node[1], leave_value_in_stack);
		var f;
		if(node[2]) {
			f = compile_tree(node[2], leave_value_in_stack);
		} else {
			f = null_if_needed([], leave_value_in_stack);
		}
		ret = ret.concat([
			['jump_if_false', t.length+1]
		], t, [
			['jump', f.length]
		], f);
		return ret;
	}
	if(node.is('while')) {
		var inverse = node.data;
		var jump_cmd = inverse ? 'jump_if_true': 'jump_if_false';

		var body = compile_tree(node[1], false);
		process_break(body, 1); // + 1 for jump up instruction
		process_continue(body, 0);

		ret = ret.concat(
			[
				['push_arr'],
			],
			compile_tree(node[0], true), // condition
			compile_push(),
			compile_invoke_pos_args_in_stack('Bool'),
			[
				[jump_cmd, body.length + 1], // +1 for the jump
			],
			body
		);
		var jump_up = ret.length + 1; // +1 for the jump instruction itself
		ret = ret.concat([
			['jump', -jump_up],
		]);
		return null_if_needed(ret, leave_value_in_stack);
	}
	if(node.is('for')) {
		// 0: init, 1:cond, 2:incr, 3:body
		var init = compile_tree(node[0], false);
		var cond = [].concat(
			[
				['push_arr'],
			],
			compile_tree(node[1], true),
			compile_push(),
			compile_invoke_pos_args_in_stack('Bool')
		);
		var incr = compile_tree(node[2], false);
		var body = compile_tree(node[3], false);
		var jump_up =
			cond.length +
			1 /* jump_if_false */ +
			body.length +
			incr.length +
			1 /* jump */;
		process_break(body, incr.length + 1); // + 1 for jump up instruction
		// typically continue jumps to start of the body
		// but we need it at the end, the "incr" part
		process_continue(body, body.length);
		ret = [].concat(
			init,
			cond,
			[
				['jump_if_false', body.length + incr.length + 1], // +1 for the jump
			],
			body,
			incr,
			[
				['jump', -jump_up],
			]
		);
		return null_if_needed(ret, leave_value_in_stack);
	}
	if(node.is('break')) {
		return ['$BREAK'];
	}
	if(node.is('continue')) {
		return ['$CONTINUE'];
	}
	if(PUSH_NODES[node.node_type]) {
		if(!leave_value_in_stack) {
			return [];
		}
		return [['push_' + node.node_type.slice(0, 3), node.data]];
	}
	if(CALL_NODES[node.node_type]) {
		ret = [['push_arr']];
		for(var i=0; i<node.length; i++) {
			ret = ret.concat(compile_tree(node[i], true), compile_push());
		}
		ret = ret.concat(
			[
				['push_hsh'],
				['push_str', '__' + node.node_type],
				['get_var'],
				['invoke'],
			]
		);
		return pop_if_needed(ret, leave_value_in_stack);
	}
	if(node.is('varname')) {
		ret = [
			['push_str', node.data],
			['get_var'],
		];
		return pop_if_needed(ret, leave_value_in_stack);
	}
	if(node.is('exec')) {
		// TODO: real word expansion
		ret = compile_tree(node[0]);
		ret = ret.concat(compile_invoke_pos_args_in_stack('exec'));
		return pop_if_needed(ret, leave_value_in_stack);
	}
	if(node.is('splice')) {
		return compile_tree(node[0], true);
	}
	if(node.is('array') || node.is('expressions')) {
		// TODO: implement 'expressions' here, for now it only tested with 'array'
		ret = [
			['comment', 'start', node.node_type],
		];
		ret = ret.concat(compile_invoke_no_args('Array'));
		var m;
		for(var i=0; i<node.length; i++) {
			var t = compile_tree(node[i]);
			ret = ret.concat(t);
			if(node[i].is('splice')) {
				m = '__add'
			} else {
				m = 'push'
			}
			ret = ret.concat([
				['push_str', m],
				['get_var'],
				['invoke2'],
			]);
		}
		ret = pop_if_needed(ret, leave_value_in_stack);
		ret = ret.concat([['comment', 'end', node.node_type]]);
		return ret;
	}
	if(node.is('binop')) {
		// node.data -- operation name
		ret = ret.concat(
			compile_tree(node[0], true),
			compile_tree(node[1], true),
			[
				['push_str', '__' + node.data],
				['get_var'],
				['invoke2'],
			]
		)
		return pop_if_needed(ret, leave_value_in_stack);
	}
	if(node.is('deftype')) {
		// TODO: new call convention
		var mk_array = compile_invoke_no_args('Array');
		ret = [].concat(
			[
				['comment', 'start', node.node_type],
				['push_str', node.data],
			],
			mk_array
		);
		for(var i=0; i<node.length; i++) {
			ret = ret.concat([
				['comment', 'start', node.node_type, 'field'],
			]);
			ret = ret.concat(
				mk_array,
				[
					['push_str', node[i].data[0]],
					['push_str', 'push'],
					['get_var'],
					['invoke2'],
					['push_str', node[i].data[1]],
					['push_str', 'push'],
					['get_var'],
					['invoke2'],
					['push_str', 'push'],
					['get_var'],
					['invoke2'],
					['comment', 'end', node.node_type, 'field'],
				]
			);
		}
		ret = ret.concat([
			['push_str', '__deftype'],
			['get_var'],
			['invoke2'],
		]);
		return ret;
	}
	if(node.is('defun')) {
		ret = compile_tree(node[0], true);
		ret = ret.concat([
			['push_str', node.data],
			['push_str', '__register_method'],
			['get_var'],
			['invoke2'],
		]);
		return pop_if_needed(ret, leave_value_in_stack);
	}
	if(node.is('lambda')) {
		var code = compile_tree(node[1], true);
		code = code.concat([['LAMBDA_NO_RET']]); // error
		ret = [].concat(
			compile_invoke_no_args('Array'),
			// Lexical scopes
			compile_invoke_no_args('__get_lexical_scopes'),
			compile_push(),
			transform_args(node[0]),
			compile_push(),
			[
				// IP
				['push_ip'],
				['jump', code.length],
			],
			code,
			[
				['push_num', 1],
				['push_str', '__add'],
				['get_var'],
				['invoke2'],
			],
			compile_push(),
			compile_invoke_pos_args_in_stack('__lambda')
		);
		return pop_if_needed(ret, leave_value_in_stack);
	}
	if(node.is('call')) {
		var methods = compile_tree(node[0]);
		var positional_args = compile_tree(node[1]);
		ret = [].concat(
			positional_args,
			[
				['push_hsh'],
			],
			methods,
			[
				['invoke']
			]
		);
		return pop_if_needed(ret, leave_value_in_stack);
	}
	if(node.is('ret')) {
		ret = compile_tree(node[0], true);
		ret = ret.concat([
			[node.node_type],
		]);
		return ret;
	}
	if(node.is('guard')) {
		ret = ret.concat(
			[
				['push_arr'],
			],
			compile_tree(node[0], true),
			compile_push(),
			compile_invoke_pos_args_in_stack('Bool'),
			[
				['guard'],
			]
		);
		return ret;
	}
	if(node.is('comment')) {
		return [['comment', 'user: ' + node.data]];
	}
	if(node.node_type) {
		throw "Don't know how to compile type '" + node.node_type + "'";
	}
	throw "Don't know how to compile '" + node + "'";
}

function compile(code, options) {
	var debug_ast = process.env.NGS_DEBUG_AST;
	var o = {
		leave_value_in_stack: false
	}
	_.extend(o, options || {});
	try {
		var tree = parser.parse(code);
	} catch(e) {
		console.log(e);
		throw e;
	}
	if(debug_ast) {
		console.log('AST BEFORE fix_binops()\n', tree.toString());
	}
	tree = fix_binops(tree);
	if(debug_ast) {
		console.log('AST AFTER fix_binops()\n', tree.toString());
	}
	var compiled = compile_tree(tree, o.leave_value_in_stack);
	if(process.env.NGS_DEBUG_COMPILED) {
		console.log('COMPILED');
		for(var i=0; i<compiled.length; i++) {
			console.log(i, compiled[i]);
		}
	}
	return {'compiled_code': compiled};
}

exports.compile = compile;
