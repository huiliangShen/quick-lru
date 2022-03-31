export default class QuickLRU extends Map {
	// init LRU
	/**
	 * options: {
	 * // 存储键值对的最大length
	 * maxSize: number = Infinity;
	 * // 过期时间
	 * maxAge: number;
	 * // 在从缓存中逐出项之前调用。对于副作用或需要显式清理的对象URL（“revokeObjectURL”）之类的项目非常有用。???
	 * onEviction?: (key: KeyType, value: ValueType) => void;
	 * }
	 * @param {*} options 
	 */
	constructor(options = {}) {
		super();

		if (!(options.maxSize && options.maxSize > 0)) {
			throw new TypeError('`maxSize` must be a number greater than 0');
		}

		if (typeof options.maxAge === 'number' && options.maxAge === 0) {
			throw new TypeError('`maxAge` must be a number greater than 0');
		}

		// TODO: Use private class fields when ESLint supports them.
		this.maxSize = options.maxSize;
		this.maxAge = options.maxAge || Number.POSITIVE_INFINITY;
		this.onEviction = options.onEviction;
		this.cache = new Map();
		this.oldCache = new Map();
		this._size = 0;
	}

	// TODO: Use private class methods when targeting Node.js 16.
	_emitEvictions(cache) {
		if (typeof this.onEviction !== 'function') {
			return;
		}

		for (const [key, item] of cache) {
			this.onEviction(key, item.value);
		}
	}
	/**
	 * 删除过期元素
	 * @param {*} key 
	 * @param {*} item 
	 * @returns false | any 
	 */
	_deleteIfExpired(key, item) {
		// 过期执行删除操作并执行onEviction
		if (typeof item.expiry === 'number' && item.expiry <= Date.now()) {
			if (typeof this.onEviction === 'function') {
				this.onEviction(key, item.value);
			}
			// 会返回value
			return this.delete(key);
		}

		return false;
	}
	/**
	 * 获取或者删除过期的内容
	 * @param {*} key 
	 * @param {*} item 
	 * @returns 
	 */
	_getOrDeleteIfExpired(key, item) {
		const deleted = this._deleteIfExpired(key, item);
		// false 为 不过期
		if (deleted === false) {
			return item.value;
		}
	}
	/**
	 * 
	 * @param {*} key 
	 * @param {*} item = {value: any, expiry?: number}
	 * @returns undefiend | any
	 */
	_getItemValue(key, item) {
		// 不存在过期时间直接返回
		// 存在判断是否过期，过期删除不返回值，不过期返回值
		return item.expiry ? this._getOrDeleteIfExpired(key, item) : item.value;
	}
	/**
	 * 验证是否过期，过期undefined否则value
	 * @param {*} key 
	 * @param {*} cache 
	 * @returns 
	 */
	_peek(key, cache) {
		const item = cache.get(key);

		return this._getItemValue(key, item);
	}
	/**
	 * 
	 * @param {*} key 
	 * @param {*} value = {value: any, expiry?: number}
	 */
	_set(key, value) {
		// cache内添加，并增加size
		this.cache.set(key, value);
		this._size++;
		
		if (this._size >= this.maxSize) {
			this._size = 0;

			// loop onEviction?.()
			this._emitEvictions(this.oldCache);
			// 清空cache
			this.oldCache = this.cache;
			this.cache = new Map();
		}
	}
	/**
	 * 移动到最近使用
	 * 从oldCache内删除并添加到cache内
	 * @param {*} key 
	 * @param {*} item 
	 */
	_moveToRecent(key, item) {
		this.oldCache.delete(key);
		this._set(key, item);
	}

	* _entriesAscending() {
		for (const item of this.oldCache) {
			const [key, value] = item;
			if (!this.cache.has(key)) {
				const deleted = this._deleteIfExpired(key, value);
				if (deleted === false) {
					yield item;
				}
			}
		}

		for (const item of this.cache) {
			const [key, value] = item;
			const deleted = this._deleteIfExpired(key, value);
			if (deleted === false) {
				yield item;
			}
		}
	}
	/**
	 * 获取item
	 * @param {*} key 
	 * @returns any
	 */
	get(key) {
		// cache内存在
		if (this.cache.has(key)) {
			const item = this.cache.get(key);

			return this._getItemValue(key, item);
		}
		// oldCache内存在
		if (this.oldCache.has(key)) {
			const item = this.oldCache.get(key);
			// false = 不过期
			if (this._deleteIfExpired(key, item) === false) {
				this._moveToRecent(key, item);
				return item.value;
			}
		}
	}
	/**
	 * 
	 * @param {*} key 
	 * @param {*} value 
	 * @param {*} param2 = {maxAge?: number} 
	 */
	set(key, value, {maxAge = this.maxAge} = {}) {
		const expiry =
			typeof maxAge === 'number' && maxAge !== Number.POSITIVE_INFINITY ?
				Date.now() + maxAge :
				undefined;
		// 判断是cache内是否存在key
		// 存在直接覆盖
		if (this.cache.has(key)) {
			this.cache.set(key, {
				value,
				expiry
			});
		} else {
			// 不存在进行新增
			this._set(key, {value, expiry});
		}
	}
	/**
	 * 判断元素是否存在
	 * @param {*}} key 
	 * @returns 
	 */
	has(key) {
		if (this.cache.has(key)) {
			return !this._deleteIfExpired(key, this.cache.get(key));
		}

		if (this.oldCache.has(key)) {
			return !this._deleteIfExpired(key, this.oldCache.get(key));
		}

		return false;
	}
	/**
	 * 获取key对应的value
	 * @param {*} key 
	 * @returns 
	 */
	peek(key) {
		if (this.cache.has(key)) {
			return this._peek(key, this.cache);
		}

		if (this.oldCache.has(key)) {
			return this._peek(key, this.oldCache);
		}
	}
	/**
	 * 删除key对应的value
	 * @param {*} key 
	 * @returns 
	 */
	delete(key) {
		const deleted = this.cache.delete(key);
		if (deleted) {
			this._size--;
		}

		return this.oldCache.delete(key) || deleted;
	}
	/**
	 * 清空
	 */
	clear() {
		this.cache.clear();
		this.oldCache.clear();
		this._size = 0;
	}

	resize(newSize) {
		if (!(newSize && newSize > 0)) {
			throw new TypeError('`maxSize` must be a number greater than 0');
		}

		const items = [...this._entriesAscending()];
		const removeCount = items.length - newSize;
		if (removeCount < 0) {
			this.cache = new Map(items);
			this.oldCache = new Map();
			this._size = items.length;
		} else {
			if (removeCount > 0) {
				this._emitEvictions(items.slice(0, removeCount));
			}

			this.oldCache = new Map(items.slice(removeCount));
			this.cache = new Map();
			this._size = 0;
		}

		this.maxSize = newSize;
	}

	* keys() {
		for (const [key] of this) {
			yield key;
		}
	}

	* values() {
		for (const [, value] of this) {
			yield value;
		}
	}

	* [Symbol.iterator]() {
		for (const item of this.cache) {
			const [key, value] = item;
			const deleted = this._deleteIfExpired(key, value);
			if (deleted === false) {
				yield [key, value.value];
			}
		}

		for (const item of this.oldCache) {
			const [key, value] = item;
			if (!this.cache.has(key)) {
				const deleted = this._deleteIfExpired(key, value);
				if (deleted === false) {
					yield [key, value.value];
				}
			}
		}
	}

	* entriesDescending() {
		let items = [...this.cache];
		for (let i = items.length - 1; i >= 0; --i) {
			const item = items[i];
			const [key, value] = item;
			const deleted = this._deleteIfExpired(key, value);
			if (deleted === false) {
				yield [key, value.value];
			}
		}

		items = [...this.oldCache];
		for (let i = items.length - 1; i >= 0; --i) {
			const item = items[i];
			const [key, value] = item;
			if (!this.cache.has(key)) {
				const deleted = this._deleteIfExpired(key, value);
				if (deleted === false) {
					yield [key, value.value];
				}
			}
		}
	}

	* entriesAscending() {
		for (const [key, value] of this._entriesAscending()) {
			yield [key, value.value];
		}
	}

	get size() {
		if (!this._size) {
			return this.oldCache.size;
		}

		let oldCacheSize = 0;
		for (const key of this.oldCache.keys()) {
			if (!this.cache.has(key)) {
				oldCacheSize++;
			}
		}

		return Math.min(this._size + oldCacheSize, this.maxSize);
	}

	entries() {
		return this.entriesAscending();
	}

	forEach(callbackFunction, thisArgument = this) {
		for (const [key, value] of this.entriesAscending()) {
			callbackFunction.call(thisArgument, value, key, this);
		}
	}

	get [Symbol.toStringTag]() {
		return JSON.stringify([...this.entriesAscending()]);
	}
}
