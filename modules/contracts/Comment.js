var private = {}, self = null,
	library = null, modules = null;

function Comment(cb, _library) {
	self = this;
	self.type = 7
	library = _library;
	cb(null, self);
}

Comment.prototype.create = function (data, trs) {
	trs.asset = {
		comment: {
			postId: data.postId,
			text: data.text
		}
	};

	return trs;
}

Comment.prototype.calculateFee = function (trs) {
	return 1000000;
}

Comment.prototype.verify = function (trs, sender, cb, scope) {
	if (trs.asset.comment.text.length == 0 || trs.asset.comment.text.length > 160) {
		return setImmediate(cb, "Text must contain from 0 to 160 letters, now there is " + trs.asset.comment.text.length + " letters");
	}

	modules.api.sql.select({
		table: "transactions",
		alias: "t",
		condition: {
			id: trs.asset.comment.postId,
			type: 6
		}
	}, function (err, rows) {
		if (err || rows.length == 0) {
			return cb(err || "Post didn't found");
		}

		return cb(null, trs);
	});
}

Comment.prototype.getBytes = function (trs) {
	var idBuffer = new Buffer(trs.asset.comment.postId, 'utf8');
	var textBuffer = new Buffer(trs.asset.comment.text, 'utf8');

	return Buffer.concat([idBuffer, textBuffer]);
}

Comment.prototype.apply = function (trs, sender, cb, scope) {
	modules.blockchain.accounts.mergeAccountAndGet({
		address: sender.address,
		balance: -trs.fee
	}, cb);
}

Comment.prototype.undo = function (trs, sender, cb, scope) {
	modules.blockchain.accounts.undoMerging({
		address: sender.address,
		balance: -trs.fee
	}, cb);
}

Comment.prototype.applyUnconfirmed = function (trs, sender, cb, scope) {
	if (sender.u_balance < trs.fee) {
		return setImmediate(cb, "Sender don't have enough amount");
	}

	modules.blockchain.accounts.mergeAccountAndGet({
		address: sender.address,
		u_balance: -trs.fee
	}, cb);
}

Comment.prototype.undoUnconfirmed = function (trs, sender, cb, scope) {
	modules.blockchain.accounts.undoMerging({
		address: sender.address,
		u_balance: -trs.fee
	}, cb);
}

Comment.prototype.ready = function (trs, sender, cb, scope) {
	setImmediate(cb);
}

Comment.prototype.save = function (trs, cb) {
	modules.api.sql.insert({
		table: "asset_comments",
		values: {
			transactionId: trs.id,
			postId: trs.asset.comment.postId,
			text: trs.asset.comment.text
		}
	}, cb);
}

Comment.prototype.dbRead = function (row) {
	if (!row.c_postId) {
		return null;
	}

	return {
		comment: {
			postId: row.c_postId,
			text: row.c_text
		}
	}
}

Comment.prototype.normalize = function (asset, cb) {
	library.validator.validate(asset.comment, {
		type: "object",
		properties: {
			postId: {
				type: "string",
				minLength: 1,
				maxLength: 21
			},
			text: {
				type: "string",
				minLength: 1,
				maxLength: 160
			}
		},
		required: ["postId", "text"]
	}, cb);
}

Comment.prototype.add = function (cb, query) {
	library.validator.validate(query, {
		type: "object",
		properties: {
			postId: {
				type: "string",
				minLength: 1,
				maxLength: 21
			},
			text: {
				type: "string",
				minLength: 1,
				maxLength: 160
			},
			secret: {
				type: "string",
				minLength: 1,
				maxLength: 100
			}
		},
		required: ['postId', 'secret', 'text']
	}, function (err) {
		if (err) {
			return cb(err[0].message);
		}

		var secret = query.secret,
			postId = query.postId,
			text = query.text;

		var keypair = modules.api.crypto.keypair(secret);

		modules.blockchain.accounts.setAccountAndGet({
			publicKey: keypair.publicKey.toString('hex')
		}, function (err, account) {
			if (err) {
				return cb(err.toString());
			}

			try {
				var transaction = library.modules.logic.transaction.create({
					type: self.type,
					postId: postId,
					sender: account,
					keypair: keypair,
					text: text
				});
			} catch (e) {
				return setImmediate(cb, e.toString());
			}

			modules.blockchain.transactions.processUnconfirmedTransaction(transaction, cb);
		});
	});
}

Comment.prototype.onBind = function (_modules) {
	modules = _modules;
	modules.logic.transaction.attachAssetType(self.type, self);
}

module.exports = Comment;