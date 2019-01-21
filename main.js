(function(localVariable) {

  var IMAGES_PER_PAGE = 150; // images per page
  const MIN_IMAGES_PER_PAGE = 10; // min images per page
  const PARALLEL_LOADING_NUMBER = 5; // number of images loaded parallelly

  const DEFAULT_BLUR_LEVEL = localVariable.get(localVariable.keys.blurLevel, 1); // default level of blur [0, RANGE_LEVELS]
  const DEFAULT_GRAY_LEVEL = localVariable.get(localVariable.keys.grayLevel, 5); // default level of gray [0, RANGE_LEVELS]
  const BLUR_MAX_LEVEL_VALUE = 1; // max value of blur
  const RANGE_LEVELS = 5; // set range level: [0, RANGE_LEVELS]
  
  const DEFAULT_URL = localVariable.get(localVariable.keys.defaultUrl, 'https://raw.githubusercontent.com/alexkimxyz/nsfw_data_scrapper/master/raw_data/neutral/urls_neutral.txt'); // default custom url
  
  /**
   * Show large image
   * @param {DOM} image DOM of <img>
   */
  const highlightImage = (function(_domTarget) {
    const classNameShow = 'show'; // class name of show

    return function(image) {
      // remove all large image elements
      while (_domTarget.firstChild) {
        _domTarget.removeChild(_domTarget.firstChild);
      }

      const domImg = image.cloneNode(); // clone image dom

      // prevent click event passing to parent
      domImg.addEventListener('click', function(evt) {
        evt.stopPropagation();
      });

      // click outside to leave
      _domTarget.addEventListener('click', function() {
        this.classList.remove(classNameShow);
      });

      _domTarget.appendChild(domImg);

      // add class name of show after this function finish, or the css animation would not show
      setTimeout(function() {
        _domTarget.classList.add(classNameShow);
      });
    };
  })(document.getElementById('highlight'));

  /**
   * Blur config setting
   */
  (function(_domRange, _domTarget, _levels, _defaultLevel, _maxLevel) {
    function onChange() {
      const min = parseInt(_domRange.getAttribute('min')); // min of range
      const max = parseInt(_domRange.getAttribute('max')); // max of range
      const value = _domRange.value;

      // change css variable of blur
      _domTarget.style.setProperty('--blur-value', ((_maxLevel*(value-min)/(max-min))+'em'));
      localVariable.set(localVariable.keys.blurLevel, value);
    }

    // handle oninput/onchange events
    _domRange.addEventListener('input', onChange);
    _domRange.addEventListener('change', onChange);

    // set default values
    _domRange.value = _defaultLevel;
    _domRange.min = 0;
    _domRange.max = _levels;
    
    // default trigger blur config
    onChange();
  })(document.querySelector('#bar .config [data-type="blur"] input'), document.getElementById('app'), RANGE_LEVELS, DEFAULT_BLUR_LEVEL, BLUR_MAX_LEVEL_VALUE);

  /**
   * Gray config setting
   */
  (function(_domRange, _domTarget, _levels, _defaultLevel) {
    function onChange() {
      const min = parseInt(_domRange.getAttribute('min')); // min of range
      const max = parseInt(_domRange.getAttribute('max')); // max of range
      const value = _domRange.value;
      
      // change css variable of gray
      _domTarget.style.setProperty('--gray-value', ((value-min)/(max-min)));
      localVariable.set(localVariable.keys.grayLevel, value);
    }

    // handle oninput/onchange events
    _domRange.addEventListener('input', onChange);
    _domRange.addEventListener('change', onChange);
    
    // set default values
    _domRange.value = _defaultLevel;
    _domRange.min = 0;
    _domRange.max = _levels;

    // default trigger gray config
    onChange();
  })(document.querySelector('#bar .config [data-type="gray"] input'), document.getElementById('app'), RANGE_LEVELS, DEFAULT_GRAY_LEVEL);

  /**
   * Progress of loading
   * @param {Integer} loaded number of loaded images
   * @param {Integer} total number of total images
   */
  const setProgress = (function(_domTarget, _domProg, _domBar) {
    const classNameDone = 'done'; // class name of done

    const setProgress = function(loaded, total) {
      var prog = parseInt(100*(loaded/total));
      if (total <= loaded) {
        _domTarget.classList.add(classNameDone);
      } else {
        _domTarget.classList.remove(classNameDone);
      }

      // clear progress status if no info
      if (isNaN(prog)) {
        prog = 0;
        loaded = '-';
        total = '-';
        _domProg.innerHTML = '-';
      } else {
        _domProg.innerHTML = (prog+'% ('+loaded+' / '+total+')');
      }

      // change css variable of progress
      _domBar.style.setProperty('--prog-size', (prog+'%'));
    };

    // default erase progress info
    setProgress();

    return setProgress;
  })(document.querySelector('#bar .status .progress'), document.querySelector('#bar .status .progress .prog'), document.querySelector('#bar .status .progress .bar'));

  /**
   * Gallery handler
   */
  const setGallery = (function(_domTarget, _parallelLoadingNumber) {
    var lastUrls = []; // record last image urls of list
    var lastStartMs = -1; // record last start timestamp
    var poolLoading = {}; // loading status of images

    // check should continue or not
    function checkInterrupt(ms) {
      if (ms < lastStartMs) {
        throw new Error('Interrupt');
      }
    }

    return {
      /**
       * Load specific type of resources
       * @param {Array} urls URLs of images
       */
      load: function(urls) {
        lastStartMs = Date.now(); // reset start timestamp for cancel past querys

        // skip loading url if not assign
        if ('undefined' === typeof urls) {
          return;
        }

        initPage(0); // erase page elements
        setGallery.clear(); // erase images list
        setProgress(); // erase progress status
        lastUrls = urls; // record image urls of list
        initPage(lastUrls.length); // initialize page elements, then show images
      },

      /**
       * Clear images of list
       */
      clear: function() {
        lastStartMs = Date.now(); // reset start timestamp for cancel past querys

        // remove all images
        while (_domTarget.firstChild) {
          _domTarget.removeChild(_domTarget.firstChild);
        }
        poolLoading = {}; // reset loading status
      },

      /**
       * Start to load part of images
       * @param {Integer} startIndex index of start
       * @return {Promise} result of loading
       */
      start: function(startIndex) {
        const startMs = Date.now(); // record start timestamp for cancel querys in the future
        const endIndex = (startIndex+IMAGES_PER_PAGE); // last index of images
        const total = (endIndex-startIndex); // number of images to load

        lastStartMs = Date.now(); // reset start timestamp for cancel past querys

        return Promise.resolve().then(function() {
          function loadNext(index) {
            checkInterrupt(startMs);
            if (poolLoading.hasOwnProperty(index)) {
              return loadNext(index+1); // already loading this image, load next one
            }

            // end of this thread
            if (endIndex <= index) {
              return Promise.resolve();
            }

            return new Promise(function(resolve, reject) {
              const url = lastUrls[index].trim(); // image url
              const domWrap = document.createElement('div');
              const domImg = document.createElement('img');

              domWrap.setAttribute('data-index', index);
              domWrap.classList.add('wrap');
              domImg.src = url;
              domImg.addEventListener('load', function() {
                try {
                  checkInterrupt(startMs);
                } catch (err) {
                  // cancel loading this image
                  console.warn('Canceled image ['+index+']');
                  delete poolLoading[index];
                  return reject(new Error('Canceled all images'));
                }

                // insert image to the right position
                var insertDom = null;
                const doms = _domTarget.children;
                for (var i=doms.length-1; 0<=i; i--) {
                  var dom = doms[i];
                  if (index < parseInt(dom.getAttribute('data-index'))) {
                    insertDom = dom;
                  } else {
                    break;
                  }
                }
                domWrap.appendChild(domImg);
                _domTarget.insertBefore(domWrap, insertDom);
                
                poolLoading[index] = 1; // loaded
                console.log('Loaded image ['+index+']');
                resolve();
              });
              domImg.addEventListener('error', function() {
                poolLoading[index] = 1; // loaded
                resolve();
              });
              domWrap.addEventListener('click', function() {
                highlightImage(domImg);
              });
              poolLoading[index] = 0; // start loading but not finish
            }).then(function() {
              const count = Object.keys(poolLoading).reduce(function(sum, index) {
                return (sum+poolLoading[index]);
              }, 0);
              setProgress(count, total);
              return loadNext(index+1);
            });
          }
          return Promise.all(new Array(_parallelLoadingNumber).fill(0).map(function(index) {
            return loadNext(startIndex+index);
          }));
        }).then(function() {
          console.log('All '+total+' images loaded: ['+startIndex+', '+endIndex+')');
        }).catch(function(err) {
          console.warn(err.message||err);
        });
      },
    };
  })(document.querySelector('#gallery .list'), PARALLEL_LOADING_NUMBER);

  /**
   * Initialize page
   * @param {Integer} total number of images
   */
  const initPage = (function(_domTarget) {

    // handle x scrolling for mouse wheel
    _domTarget.addEventListener('wheel', function(evt) {
      if (evt.deltaX) {
        return;
      }
      _domTarget.scrollLeft += (2*evt.deltaY);
    });

    return function(total) {
      const _defaultImagesPerPage = IMAGES_PER_PAGE;
      var pages = Math.ceil(total/_defaultImagesPerPage); // number of pages

      // remove all page elements
      while (_domTarget.firstChild) {
        _domTarget.removeChild(_domTarget.firstChild);
      }

      // generate page elements
      while (0 < pages--) {
        var domItem = document.createElement('span');
        domItem.setAttribute('data-start', pages);
        domItem.innerHTML = (pages+1);
        domItem.addEventListener('click', function() {
          const startIndex = (_defaultImagesPerPage*parseInt(this.getAttribute('data-start'))); // start index of images
          const domLast = _domTarget.querySelector('[data-start].focused');
          if (domLast) {
            domLast.classList.remove('focused');
          }
          this.classList.add('focused');
          this.parentElement.scrollLeft = (this.offsetLeft-(.5*this.parentElement.clientWidth));
          setProgress();
          setGallery.clear();
          setGallery.start(startIndex);
        });
        _domTarget.insertBefore(domItem, _domTarget.firstChild);
      }

      // default show page 1
      if (total) {
        _domTarget.firstChild.click();
      }
    };
  })(document.getElementById('page'), IMAGES_PER_PAGE);

  /**
   * Set images per page
   */
  (function(_domTarget, _minImagesPerPage, _defaultImagesPerPage) {
    var lastValue = _defaultImagesPerPage; // record last images per page

    // handle value of images per page
    _domTarget.addEventListener('change', function() {
      const value = Math.max(_minImagesPerPage, parseInt(this.value));
      if (isNaN(value)) {
        return this.value = lastValue;
      }
      this.value = value;
      IMAGES_PER_PAGE = value;
      setGallery.load();
    });
    
    // set default images per page
    _domTarget.value = lastValue;

  })(document.querySelector('#bar .status .perpage input'), MIN_IMAGES_PER_PAGE, IMAGES_PER_PAGE);

  /**
   * Set custom list
   */
  (function(_domTarget, _domValue, _domFile, _domSubmit, _defaultUrl) {

    var lastResource = _defaultUrl;

    // handle file selector
    _domFile.addEventListener('click', function() {
      const domFileSelector = document.createElement('input');
      domFileSelector.type = 'file';
      domFileSelector.style.display = 'none';
      domFileSelector.addEventListener('change', function() {
        if (!this.files.length) {
          return Promise.resolve();
        }
        const file = this.files[0];
        lastResource = file;
        _domValue.value = file.name;
        this.parentNode.removeChild(this);
      });
      _domTarget.appendChild(domFileSelector);
      domFileSelector.click();
    });

    // handle enter key to submit
    _domValue.addEventListener('keydown', function(evt) {
      if (13 === evt.keyCode) {
        _domSubmit.click();
      }
    });
    _domValue.addEventListener('change', function() {
      lastResource = this.value;
    });

    // submit list
    _domSubmit.addEventListener('click', function() {
      this.setAttribute('disabled', '');
      new Promise(function(resolve, reject) {

        if (lastResource instanceof File) {
          // load file
          const fileReader = new FileReader();
          fileReader.addEventListener('load', function() {
            resolve(this.result);
          });
          fileReader.addEventListener('error', reject);
          fileReader.readAsText(lastResource);
          localVariable.remove(localVariable.keys.defaultUrl);

        } else if ('string' === typeof lastResource) {
          // load url
          const req = new XMLHttpRequest();
          req.open('GET', lastResource, true);
          req.addEventListener('load', function() {
            var result = this.response;
            if (200 !== this.status) {
              return reject(result);
            }
            resolve(result);
          });
          req.addEventListener('error', reject);
          req.send();
          localVariable.set(localVariable.keys.defaultUrl, lastResource);

        } else {
          // unknown list type
          throw new Error('Unknown list type: '+(typeof lastResource));
        }
      }).then(function(text) {
        // parse urls
        return (text.match(/\b[^\s]+\b/g)||[]).filter(function(url) {
          return (0<url.length);
        });
      }).then(function(urls) {
        return setGallery.load(urls);
      }).catch(function(err) {
        console.warn(err.message||err);
      }).then(function() {
        _domSubmit.removeAttribute('disabled');
      });
    });

    if ('undefined' === typeof _defaultUrl) {
      _defaultUrl = '';
    }
    _domValue.value = _defaultUrl; // set default url

  })(document.querySelector('#bar .custom'), document.querySelector('#bar .custom [name="value"]'), document.querySelector('#bar .custom [name="file"]'), document.querySelector('#bar .custom [name="submit"]'), DEFAULT_URL);

})((function(_storage) {
  return {
    keys: {
      defaultUrl: 'defaultUrl',
      blurLevel: 'blurLevel',
      grayLevel: 'grayLevel',
    },

    /**
     * Get variable of key
     * @param {String} key name of variable
     * @param {String} other value if variable not set
     * @return {String} variable
     */
    get: function(key, other) {
      const value = _storage.getItem(key);
      console.log(key, value);
      if (null === value) {
        return other;
      } else {
        return value;
      }
    },

    /**
     * Set variable of key
     * @param {String} key name of variable
     * @param {String} value value of variable
     */
    set: function(key, value) {
      return _storage.setItem(key, value);
    },

    /**
     * Remove variable of key
     * @param {String} key name of variable
     */
    remove: function(key) {
      return _storage.removeItem(key);
    },
  };
})(localStorage));