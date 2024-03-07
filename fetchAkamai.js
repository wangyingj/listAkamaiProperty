const EdgeGrid = require('akamai-edgegrid');

const eg = new EdgeGrid({
  path: '~/.edgerc',
  section: 'default',
});

// Helper function to add delay, avoid triggering Akamai DDoS Block
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchRules(property, hostname) {
  return new Promise((resolve, reject) => {
    const propertyId = property.propertyId;
    const productionVersion = property.productionVersion;
    const contractId = property.contractId;
    const groupId = property.groupId;

    eg.auth({
      path: `/papi/v1/properties/${propertyId}/versions/${productionVersion}/rules?contractId=${contractId}&groupId=${groupId}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    eg.send((error, response, body) => {
      if (error) {
        reject(error);
        return;
      }

      const rules = JSON.parse(body).rules;
      const originBehavior = rules.behaviors.find(b => b.name === 'origin');
      const originHostname = originBehavior ? originBehavior.options.hostname : '';
      const cpCodeBehavior = rules.children.find(c => c.name === 'Augment insights')?.children[0]?.behaviors[0];
      const cpCode = cpCodeBehavior ? cpCodeBehavior.options.value.description : '';
      const siteShieldMapBehavior = rules.behaviors.find(b => b.name === 'siteShield');
      const siteShieldMap = siteShieldMapBehavior ? siteShieldMapBehavior.options.ssmap.name : '';

      resolve(`${propertyId}, ${property.propertyName}, ${hostname.cnameFrom}, ${originHostname}, ${cpCode}, ${siteShieldMap}\n`);
    });
  });
}

async function fetchHostnames(property) {
    return new Promise((resolve, reject) => {
      const propertyId = property.propertyId;
      console.log("Fetching Property: " + property.propertyName);
  
      eg.auth({
        path: `/papi/v1/properties/${propertyId}/hostnames`,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
  
      eg.send(async (error, response, body) => {
        if (error) {
          reject(error);
          return;
        }
  
        const hostnames = JSON.parse(body).hostnames.items;
  
        let results = '';
        for (const hostname of hostnames) { // Fetch rules for each hostname serially
            if (hostname.productionCnameTo) {
                results += await fetchRules(property, hostname);
            }
            await sleep(1000); // Add delay here
        }

        console.log("Property: " + property.propertyName + " has been fetched successfully! ");  
        
        resolve(results);
      });
    });
  }

// Get user inputs for contractId and groupId
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('Please enter your contractId: ', (contractId) => {
  readline.question('Please enter your groupId: ', async (groupId) => {
    eg.auth({
      path: `/papi/v1/properties?contractId=${contractId}&groupId=${groupId}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    eg.send(async (error, response, body) => {
      if (error) {
        console.log(error);
        return;
      }

      const properties = JSON.parse(body).properties.items;
      let csvOutput = "Property ID, Property Name, Hostname, Origin Hostname, CP Code, SiteShield Map\n";

      const results = await Promise.all(properties.map(fetchHostnames));

      csvOutput += results.join('');

      console.log(csvOutput);
    });

    readline.close();
  });
});