# Configuración manual de Microsoft para PW Fleet

Esta guía contiene exclusivamente los pasos que debe realizar manualmente un administrador autorizado en el tenant de City of Harvey. El despliegue no modifica Azure, Microsoft Entra ID ni Exchange Online automáticamente.

## 1. Preparar la identidad administrativa

1. Entre a [Microsoft Entra admin center](https://entra.microsoft.com/) y cambie al tenant de City of Harvey.
2. Abra **Entra ID > Users** y confirme que el administrador inicial existe como miembro o invitado habilitado en ese tenant.
3. Abra ese usuario y copie su **Object ID**. No use el Object ID de su tenant de origen. PW Fleet lo combinará con el issuer del tenant de City of Harvey para preasignar la identidad de forma inmutable.

Microsoft documenta que `oid` es el identificador inmutable del usuario dentro del tenant y que el correo o UPN no debe usarse como clave de autorización: [ID token claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference).

## 2. Crear la aplicación de inicio de sesión

1. Abra **Entra ID > App registrations > New registration**.
2. Use el nombre **City of Harvey PW Fleet**.
3. En **Supported account types**, seleccione **Accounts in this organizational directory only (Single tenant)**.
4. Registre la aplicación. Microsoft recomienda el modelo single-tenant para aplicaciones internas: [Register an application](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app).
5. Copie:
   - **Application (client) ID**
   - **Directory (tenant) ID**
6. Abra **Authentication > Add a platform > Web** y registre exactamente:
   - Redirect URI: `https://pwfleet.cityofharveyil.gov/auth/callback`
   - Front-channel logout URL: `https://pwfleet.cityofharveyil.gov/auth/login`
7. No habilite implicit grant. PW Fleet usa Authorization Code, PKCE, state y nonce.
8. Abra **Certificates & secrets > Client secrets > New client secret**. Seleccione la menor vigencia operativamente viable y copie inmediatamente el campo **Value**; no copie el Secret ID. Guarde el valor en el proceso seguro de secretos de la organización.
9. En **Token configuration**, agregue `email` como optional claim para ID tokens si desea mostrar el correo corporativo. PW Fleet no usa ese valor mutable como identidad ni asigna roles desde claims externos.

La URI debe registrarse como plataforma Web y coincidir exactamente con la utilizada por la aplicación: [Add a redirect URI](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri).

## 3. Valores resultantes para la autenticación

Prepare estos cuatro valores sin colocarlos en Git, tickets o documentación pública:

```text
OIDC_ISSUER=https://login.microsoftonline.com/<DIRECTORY_TENANT_ID>/v2.0
OIDC_CLIENT_ID=<APPLICATION_CLIENT_ID>
OIDC_CLIENT_SECRET=<CLIENT_SECRET_VALUE>
BOOTSTRAP_ADMIN_IDENTITY_SUBJECT=<ADMIN_USER_OBJECT_ID_IN_CITY_TENANT>
```

El administrador del servidor los almacenará en `/etc/pwfleet/app.env`, protegido como `root:pwfleet` con modo `0640`. El proceso `pwfleet` puede leerlos, pero no aparecen en Git ni en el QR.

## 4. Crear una aplicación separada para correo OAuth2

Se recomienda una segunda aplicación para mantener separados el inicio de sesión interactivo y el permiso de envío de correo.

1. En **App registrations**, cree **City of Harvey PW Fleet Mailer** como single-tenant.
2. No agregue redirect URI; esta integración usa client credentials y no inicia sesión como usuario.
3. Copie su **Application (client) ID** y **Directory (tenant) ID**.
4. Cree un client secret y copie únicamente su **Value**.
5. Abra **API permissions > Add a permission > APIs my organization uses**.
6. Busque **Office 365 Exchange Online**.
7. Seleccione **Application permissions > SMTP.SendAsApp** y agregue el permiso.
8. Seleccione **Grant admin consent for City of Harvey** y confirme que el estado figure como concedido.

Estos son los permisos y el flujo documentados por Microsoft para SMTP OAuth2 con client credentials: [Authenticate SMTP using OAuth](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth).

## 5. Limitar el mailer a un buzón autorizado

Use Exchange Online PowerShell desde su estación administrativa. Sustituya todos los valores entre `< >` y revise cada comando antes de ejecutarlo.

```powershell
Install-Module -Name ExchangeOnlineManagement
Import-Module ExchangeOnlineManagement
Connect-ExchangeOnline -Organization <DIRECTORY_TENANT_ID>

New-ServicePrincipal `
  -AppId <MAILER_APPLICATION_CLIENT_ID> `
  -ObjectId <MAILER_ENTERPRISE_APPLICATION_OBJECT_ID> `
  -DisplayName "City of Harvey PW Fleet Mailer"

$mailer = Get-ServicePrincipal -Identity "City of Harvey PW Fleet Mailer"

Add-MailboxPermission `
  -Identity "<PW_FLEET_SENDER_MAILBOX>" `
  -User $mailer.Identity `
  -AccessRights FullAccess

Add-RecipientPermission `
  -Identity "<PW_FLEET_SENDER_MAILBOX>" `
  -Trustee $mailer.Identity `
  -AccessRights SendAs `
  -Confirm:$false
```

El `ObjectId` de `New-ServicePrincipal` debe ser el **Object ID de Enterprise applications**, no el Object ID mostrado en App registrations. Microsoft advierte que intercambiarlos provoca un fallo de autenticación. Conceda acceso solamente al buzón remitente destinado a PW Fleet.

## 6. Valores resultantes para correo

```text
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_AUTH_MODE=oauth2
SMTP_USERNAME=<PW_FLEET_SENDER_MAILBOX>
SMTP_PASSWORD=
SMTP_OAUTH_TENANT_ID=<DIRECTORY_TENANT_ID>
SMTP_OAUTH_CLIENT_ID=<MAILER_APPLICATION_CLIENT_ID>
SMTP_OAUTH_CLIENT_SECRET=<MAILER_CLIENT_SECRET_VALUE>
EMAIL_FROM="City of Harvey PW Fleet <sender-mailbox@cityofharveyil.gov>"
```

PW Fleet solicitará tokens al scope `https://outlook.office365.com/.default` y usará SASL XOAUTH2 sobre STARTTLS en el puerto 587. No requiere guardar la contraseña de un usuario o buzón.

## 7. Entrega y activación

Entregue mediante un canal seguro los ocho valores de las secciones 3 y 6 al administrador del servidor. El administrador deberá:

1. guardarlos en `/etc/pwfleet/app.env` sin imprimirlos en consola;
2. ejecutar la validación de configuración;
3. enlazar el Object ID del administrador inicial;
4. ejecutar el preflight de OIDC, PostgreSQL, almacenamiento, ClamAV y SMTP;
5. iniciar `pwfleet.service` y `pwfleet-worker.timer`;
6. validar login, logout, envío, alertas, PDF y descarga a través de la URL pública.

La aplicación permanece intencionalmente detenida si falta cualquiera de estos valores o si Microsoft rechaza discovery, token o SMTP. No debe sustituirse el preflight por valores ficticios para iniciar producción.
