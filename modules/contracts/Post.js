var private = {}, self = null,
	library = null, modules = null;

function Post(cb, _library) {
	self = this;
	self.type = 6
	library = _library;
	cb(null, self);
}

Post.prototype.create = function (data, trs) {
	// base data
	trs.asset = {
		post: {
			title: data.title,
			text: data.text
		}
	};

	return trs;
}

Post.prototype.calculateFee = function (trs) {
	return 10000000;
}

Post.prototype.verify = function (trs, sender, cb, scope) {
	if (trs.asset.post.title.length > 100 || trs.asset.post.title.length == 0) {
		return setImmediate(cb, "Title must contain from 0 to 100 letters, now there is " + trs.asset.post.title.length + " letters");
	}

	if (trs.asset.post.text.length > 5000 || trs.asset.post.text == 0) {
		return setImmediate(cb, "Text must contain from 0 to 50000 letters, now there is " + trs.asset.post.text.length + " letters");
	}

	setImmediate(cb, null, trs);
}

Post.prototype.getBytes = function (trs) {
	var titleBuffer = new Buffer(trs.asset.post.title, 'utf8');
	var textBuffer = new Buffer(trs.asset.post.text, 'utf8');


	return Buffer.concat([titleBuffer, textBuffer]);
}

Post.prototype.apply = function (trs, sender, cb, scope) {
	modules.blockchain.accounts.mergeAccountAndGet({
		address: sender.address,
		balance: -trs.fee
	}, cb);
}

Post.prototype.undo = function (trs, sender, cb, scope) {
	modules.blockchain.accounts.undoMerging({
		address: sender.address,
		balance: -trs.fee
	}, cb);
}

Post.prototype.applyUnconfirmed = function (trs, sender, cb, scope) {
	if (sender.u_balance < trs.fee) {
		return setImmediate(cb, "Sender don't have enough amount");
	}

	modules.blockchain.accounts.mergeAccountAndGet({
		address: sender.address,
		u_balance: -trs.fee
	}, cb);
}

Post.prototype.undoUnconfirmed = function (trs, sender, cb, scope) {
	modules.blockchain.accounts.undoMerging({
		address: sender.address,
		u_balance: -trs.fee
	}, cb);
}

Post.prototype.ready = function (trs, sender, cb, scope) {
	setImmediate(cb);
}

Post.prototype.save = function (trs, cb) {
	modules.api.sql.insert({
		table: "asset_posts",
		values: {
			transactionId: trs.id,
			title: trs.asset.post.title,
			text: trs.asset.post.text
		}
	}, cb);
}

Post.prototype.dbRead = function (row) {
	if (!row.p_title) {
		return null;
	}

	return {
		post: {
			title: row.p_title,
			text: row.p_text
		}
	}
}

Post.prototype.normalize = function (asset, cb) {
	library.validator.validate(asset.post, {
		type: "object",
		properties: {
			title: {
				type: "string",
				minLength: 1,
				maxLength: 100
			},
			text: {
				type: "string",
				minLength: 1,
				maxLength: 5000
			}
		},
		required: ["title", "text"]
	}, cb);
}

Post.prototype.add = function (cb, query) {
	library.validator.validate(query, {
		type: "object",
		properties: {
			title: {
				type: "string",
				minLength: 1,
				maxLength: 100
			},
			text: {
				type: "string",
				minLength: 1,
				maxLength: 5000
			},
			secret: {
				type: "string",
				minLength: 1,
				maxLength: 100
			}
		},
		required: ["title", "text", "secret"]
	}, function (err) {
		if (err) {
			return cb(err[0].message);
		}

		var secret = query.secret,
			title = query.title,
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
					title: title,
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

Post.prototype.onBind = function (_modules) {
	modules = _modules;
	modules.logic.transaction.attachAssetType(self.type, self);
}

module.exports = Post;