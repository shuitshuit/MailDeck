import { Authenticator } from '@aws-amplify/ui-react'
import { Amplify } from 'aws-amplify'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { config } from './config'
import './index.css'

// Configure Amplify
console.log('MailDeck Config Configured:', config); // Debug log
const cognitoConfig = {
  Auth: {
    Cognito: {
      userPoolId: config.aws.userPoolId,
      userPoolClientId: config.aws.userPoolClientId,
      loginWith: {
        oauth: {
          domain: config.auth.domain,
          scopes: ['email', 'profile', 'openid'],
          redirectSignIn: [config.auth.redirectSignIn],
          redirectSignOut: [config.auth.redirectSignOut],
          responseType: 'code' as const,
        }
      }
    }
  }
}

Amplify.configure(cognitoConfig);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Authenticator.Provider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Authenticator.Provider>
  </React.StrictMode>,
)
