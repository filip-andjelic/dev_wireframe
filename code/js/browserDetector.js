var BrowserDetector = {};
BrowserDetector.detectBrowserVersion = function() {
  var userAgent = navigator.userAgent;
  var version = "";
  var browser = userAgent.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];

  if (/trident/i.test(browser[1])) {
      version = /\brv[ :]+(\d+)/g.exec(userAgent) || [];

      return {
          name:'IE',
          version: (version[1] || '')
      };
  }

  if(browser[1] === 'Chrome') {
      version = userAgent.match(/\bOPR|Edge\/(\d+)/);

      if(version !== null) {
          return {
              name:'Edge',
              version: version[1]
          };
      }
  }

  browser = browser[2] ? [browser[1], browser[2]] : [navigator.appName, navigator.appVersion, '-?'];

  if((version = userAgent.match(/version\/(\d+)/i)) !== null) {
      browser.splice(1, 1, version[1]);
  }

  return {
      name: browser[0],
      version: browser[1]
  };
};
BrowserDetector.detectDeprecatedBrowser = function() {
  var browser = BrowserDetector.detectBrowserVersion();
  var linkToUpdate = false;
  var isDeprecated = false;

  switch (browser.name) {
    case "Safari":
      if (parseFloat(browser.version) <= 6) {
        isDeprecated = true;
      }
      linkToUpdate = "https://support.apple.com/downloads/safari";
      break;
    case "Chrome":
      if (parseFloat(browser.version) <= 25) {
        isDeprecated = true;
      }
      break;
    case "Firefox":
      if (parseFloat(browser.version) <= 25) {
        isDeprecated = true;
      }
      linkToUpdate = "https://www.mozilla.org/en-US/firefox/new/";
      break;
    case "MSIE":
      if (parseFloat(browser.version) <= 10) {
        isDeprecated = true;
      }
      linkToUpdate = "https://www.microsoft.com/en-us/download/details.aspx?id=48126";
      break;
  }

  return {
    isDeprecated: isDeprecated,
    browser: browser,
    linkToUpdate: linkToUpdate
  }
};