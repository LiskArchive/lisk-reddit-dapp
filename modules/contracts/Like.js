var async = require('async');

var private = {}, self = null,
	library = null, modules = null;

function Like(cb, _library) {
	self = this;
	self.type = 8
	library = _library;
	cb(null, self);
}

Like.prototype.create = function (data, trs) {
	trs.amount = 10000000;
	trs.recipientId = data.recipientId;
	trs.asset = {
		like: {
			postId: data.postId
		}
	};

	return trs;
}

Like.prototype.calculateFee = function (trs) {
	var fee = parseInt(trs.amount / 100 * 0.1);
	return fee || (1 * constants.fixedPoint);
}

Like.prototype.verify = function (trs, sender, cb, scope) {
	if (trs.amount != 10000000){
		return cb("Incorrect amount of like");
	}

	modules.api.sql.select({
		table: "transactions",
		alias: "t",
		condition: {
			id: trs.asset.like.postId,
			type: 6
		}
	}, function (err, rows) {
		if (err || rows.length == 0) {
			return cb(err || "Post didn't found");
		}

		return cb(null, trs);
	});
}

Like.prototype.getBytes = function (trs) {
	return new Buffer(trs.asset.like.postId, 'utf8');
}

Like.prototype.apply = function (trs, sender, cb, scope) {
	var amount = trs.amount + trs.fee;

	if (sender.balance < amount) {
		return setImmediate(cb, "Balance has no LISK: " + trs.id);
	}

	async.series([
		function (cb) {
			modules.blockchain.accounts.mergeAccountAndGet({
				address: sender.address,
				balance: -amount
			}, cb, scope);
		},
		function (cb) {
			modules.blockchain.accounts.mergeAccountAndGet({
				address: trs.recipientId,
				balance: trs.amount
			}, cb, scope);
		}
	], cb);
}

Like.prototype.undo = function (trs, sender, cb, scope) {
	var amount = trs.amount + trs.fee;

	async.series([
		function (cb) {
			modules.blockchain.accounts.undoMerging({
				address: sender.address,
				balance: -amount
			}, cb, scope);
		},
		function (cb) {
			modules.blockchain.accounts.undoMerging({
				address: trs.recipientId,
				balance: trs.amount
			}, cb, scope);
		}
	], cb);
}

Like.prototype.applyUnconfirmed = function (trs, sender, cb, scope) {
	var amount = trs.amount + trs.fee;

	if (sender.u_balance < amount) {
		return setImmediate(cb, 'Account has no balance: ' + trs.id);
	}

	async.series([
		function (cb) {
			modules.blockchain.accounts.mergeAccountAndGet({
				address: sender.address,
				u_balance: -amount
			}, cb, scope);
		},
		function (cb) {
			modules.blockchain.accounts.mergeAccountAndGet({
				address: trs.recipientId,
				u_balance: trs.amount
			}, cb, scope);
		}
	], cb);
}

Like.prototype.undoUnconfirmed = function (trs, sender, cb, scope) {
	var amount = trs.amount + trs.fee;

	async.series([
		function (cb) {
			modules.blockchain.accounts.undoMerging({
				address: sender.address,
				u_balance: -amount
			}, cb, scope);
		},
		function (cb) {
			modules.blockchain.accounts.undoMerging({
				address: trs.recipientId,
				u_balance: trs.amount
			}, cb, scope);
		}
	], cb);
}

Like.prototype.ready = function (trs, sender, cb, scope) {
	setImmediate(cb);
}

Like.prototype.save = function (trs, cb) {
	modules.api.sql.insert({
		table: "asset_likes",
		values: {
			transactionId: trs.id,
			postId: trs.asset.like.postId,
		}
	}, cb);
}

Like.prototype.dbRead = function (row) {
	if (!row.l_postId) {
		return null;
	}

	return {
		like: {
			postId: row.l_postId
		}
	}
}

Like.prototype.normalize = function (asset, cb) {
	library.validator.validate(asset.like, {
		type: "object",
		properties: {
			postId: {
				type: "string",
				minLength: 1,
				maxLength: 21
			}
		},
		required: ["postId"]
	}, cb);
}

Like.prototype.add = function (cb, query) {
	library.validator.validate(query, {
		type: "object",
		properties: {
			postId: {
				type: "string",
				minLength: 1,
				maxLength: 21
			},
			secret: {
				type: "string",
				minLength: 1,
				maxLength: 100
			}
		},
		required: ['postId', 'secret']
	}, function (err) {
		if (err) {
			return cb(err[0].message);
		}

		var secret = query.secret,
			postId = query.postId;

		var keypair = modules.api.crypto.keypair(secret);

		modules.blockchain.accounts.setAccountAndGet({
			publicKey: keypair.publicKey.toString('hex')
		}, function (err, account) {
			if (err) {
				return cb(err.toString());
			}

			modules.api.sql.select({
				table: "transactions",
				alias: "t",
				condition: {
					id: query.postId,
					type: 6
				},
				fields: ['senderPublicKey']
			}, {senderPublicKey: String}, function (err, rows) {
				if (err || rows.length == 0) {
					return cb(err? err.toString() : "Can't find post");
				}

				modules.blockchain.accounts.getAccount({
					publicKey: rows[0].senderPublicKey
				}, function (err, recipient) {
					if (err || !recipient) {
						return cb(err? err.toString() : "Can't find recipient");
					}

					try {
						var transaction = library.modules.logic.transaction.create({
							type: self.type,
							recipientId: recipient.address,
							postId: postId,
							sender: account,
							keypair: keypair
						});
					} catch (e) {
						return setImmediate(cb, e.toString());
					}

					modules.blockchain.transactions.processUnconfirmedTransaction(transaction, cb);
				});
			});
		});
	});
}

Like.prototype.onBind = function (_modules) {
	modules = _modules;
	modules.logic.transaction.attachAssetType(self.type, self);
}

module.exports = Like;
