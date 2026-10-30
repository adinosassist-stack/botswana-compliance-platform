// A request-scoped server signal; never serialized into the public auth response.
export const REGISTRATION_CREATION_OUTCOME=Symbol('registration-creation-outcome');

export function noteRegistrationCreated(env){
  const outcome=env?.[REGISTRATION_CREATION_OUTCOME];
  if(outcome)outcome.created=true;
}
