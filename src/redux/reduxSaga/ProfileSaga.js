import { call, put, select, takeLatest } from 'redux-saga/effects';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getApi,
  postApi,
  putApi,
} from '../../utils/helpers/ApiRequest';

import {
  userDetailsSuccess,
  userDetailsFailure,
  offenceTypesFailure,
  offenceTypesSuccess,

  createEChallanFailure,
  createEChallanSuccess,
  challanListFailure,
  challanListSuccess,
  razorPayCreateOrderIDSuccess,
  razorPayCreateOrderIDFailure,
  verifyPaymentFailure,
  verifyPaymentSuccess,
  paybyCashSuccess,
  paybyCashFailure,
  getWardListSuccess,
  getWardListFailure,
} from '../reducer/ProfileReducer';
import showErrorAlert from '../../utils/helpers/Toast';
import {
  getTokenSuccess,
  logoutRequest,
  logoutSuccess,
} from '../reducer/AuthReducer';
import constants from '../../utils/helpers/constants';
import ShowMessage from '../../utils/helpers/ShowMessage';
let getItem = state => state.AuthReducer;

//User Profile Details

export function* userDetailsSaga(action) {
  let items = yield select(getItem);

  let header = {
    Accept: 'application/json',
    contenttype: 'application/json',
    accesstoken: items?.getTokenResponse,
  };
  try {
    let response = yield call(getApi, 'getProfile', header);

    if (response?.data?.meta?.code == 200) {
      yield put(userDetailsSuccess(response?.data?.data));
    } else {
      yield put(userDetailsFailure(response?.data));
      showErrorAlert(response?.data?.meta?.message);
    }
  } catch (error) {
    console.log('error>>>>>>>>>>', error);

    yield put(userDetailsFailure(error?.response?.data));
    if (error?.response?.data?.meta?.message == 'Token is invalid or expired') {
      yield call(AsyncStorage.removeItem, constants.TOKEN);
      yield put(getTokenSuccess(null));
      yield put(logoutSuccess());
    }
  }
}
export function* offenceTypesSaga(action) {
  let items = yield select(getItem);

  let header = {
    Accept: 'application/json',
    contenttype: 'application/json',
    accesstoken: items?.getTokenResponse,
  };
  try {
    let response = yield call(
      getApi,
      `getAllOffenses`,
      header,
    );

    if (response?.data?.meta?.code == 200) {
      yield put(offenceTypesSuccess(response?.data?.data));
    } else if (response?.data?.meta?.code == 404) {
      yield put(offenceTypesSuccess(response?.data?.meta));
      showErrorAlert(response?.data?.meta?.message);
    } else {
      yield put(offenceTypesFailure(response?.data));
      showErrorAlert(response?.data?.meta?.message);
    }
  } catch (error) {
    yield put(offenceTypesFailure(error?.response?.data));
    if (error?.response?.data?.meta?.message == 'Token is invalid or expired') {
      yield call(AsyncStorage.removeItem, constants.TOKEN);
      yield put(getTokenSuccess(null));
      yield put(logoutSuccess());
    }
  }
}

export function* createEChallanSaga(action) {
  let items = yield select(getItem);

  try {
    let Header = {
      Accept: 'application/json',
      contenttype: 'multipart/form-data',
      accesstoken: items?.getTokenResponse,
    };

    const response = yield call(
      postApi,
      'challans',
      action.payload,
      Header,
    );
    console.log('Challan Create response:', response);

    if (response?.data?.meta?.code == 201) {
      yield put(createEChallanSuccess(response?.data?.data));
      // showErrorAlert(response?.data?.meta?.message);
      ShowMessage(response?.data?.meta?.message, 'success');
    } else {
      yield put(createEChallanFailure(response?.data?.data));
      // showErrorAlert(response?.data?.meta?.message);
      console.log('Challan Create Failure:', response?.data?.meta?.message);
      
      ShowMessage(response?.data?.meta?.message, 'error');
    }
  } catch (error) {
    console.log("Challan Create Error:", error);
    
    yield put(createEChallanFailure(error?.response?.data));
    // showErrorAlert(error?.response?.data?.meta?.message);
  }
}

export function* challanListSaga(action) {
  let items = yield select(getItem);

  let header = {
    Accept: 'application/json',
    contenttype: 'application/json',
    accesstoken: items?.getTokenResponse,
  };
  try {
    let response = yield call(
      getApi,
      `challans?page=${action.payload.page}&limit=${action.payload.limit}`,
      header,
    );

    if (response?.data?.meta?.code == 200) {
      yield put(challanListSuccess(response?.data?.data));
    } else if (response?.data?.meta?.code == 404) {
      yield put(challanListSuccess(response?.data?.meta));
      showErrorAlert(response?.data?.meta?.message);
    } else {
      yield put(challanListFailure(response?.data));
      showErrorAlert(response?.data?.meta?.message);
    }
  } catch (error) {
    yield put(challanListFailure(error?.response?.data));
    if (error?.response?.data?.meta?.message == 'Token is invalid or expired') {
      yield call(AsyncStorage.removeItem, constants.TOKEN);
      yield put(getTokenSuccess(null));
      yield put(logoutSuccess());
    }
  }
}

export function* razorPayCreateOrderIDSaga(action) {
  let items = yield select(getItem);

  try {
    let Header = {
      Accept: 'application/json',
      contenttype: 'application/json',
      accesstoken: items?.getTokenResponse,
    };

    const response = yield call(
      postApi,
      'challans/create-order',
      action.payload,
      Header,
    );

    if (response?.data?.meta?.code == 200) {
      yield put(razorPayCreateOrderIDSuccess(response?.data?.data));
      // showErrorAlert(response?.data?.meta?.message);
      ShowMessage(response?.data?.meta?.message, 'success');
    } else {
      yield put(razorPayCreateOrderIDFailure(response?.data?.data));
      // showErrorAlert(response?.data?.meta?.message);
      console.log('razorPayCreateOrderIDSaga:', response?.data?.meta?.message);
      
      ShowMessage(response?.data?.meta?.message, 'error');
    }
  } catch (error) {
    console.log("razorPayCreateOrderIDSaga",error);
    
    yield put(razorPayCreateOrderIDFailure(error?.response?.data));
    // showErrorAlert(error?.response?.data?.meta?.message);
  }
}
export function* verifyPaymentSaga(action) {
  let items = yield select(getItem);

  try {
    let Header = {
      Accept: 'application/json',
      contenttype: 'application/json',
      accesstoken: items?.getTokenResponse,
    };

    const response = yield call(
      postApi,
      'challans/verify-payment',
      action.payload,
      Header,
    );
    console.log('verifyPaymentSaga response:', response);

    if (response?.data?.meta?.code == 200) {
      yield put(verifyPaymentSuccess(response?.data?.data));
      // showErrorAlert(response?.data?.meta?.message);
      ShowMessage(response?.data?.meta?.message, 'success');
    } else {
      yield put(verifyPaymentFailure(response?.data?.data));
      // showErrorAlert(response?.data?.meta?.message);
      console.log('verifyPaymentSaga:', response?.data?.meta?.message);
      
      ShowMessage(response?.data?.meta?.message, 'error');
    }
  } catch (error) {
    console.log("verifyPaymentSaga",error);
    
    yield put(verifyPaymentFailure(error?.response?.data));
    // showErrorAlert(error?.response?.data?.meta?.message);
  }
}
export function* payByCashSaga(action) {
  let items = yield select(getItem);

  try {
    let Header = {
      Accept: 'application/json',
      contenttype: 'application/json',
      accesstoken: items?.getTokenResponse,
    };

    const response = yield call(
      postApi,
      'challans/cash-payment',
      action.payload,
      Header,
    );

    if (response?.data?.meta?.code == 200) {
      yield put(paybyCashSuccess(response?.data?.data));
      // showErrorAlert(response?.data?.meta?.message);
      ShowMessage(response?.data?.meta?.message, 'success');
    } else {
      yield put(paybyCashFailure(response?.data?.data));
      // showErrorAlert(response?.data?.meta?.message);
      
      ShowMessage(response?.data?.meta?.message, 'error');
    }
  } catch (error) {
    console.log("payByCashSaga",error);
    
    yield put(paybyCashFailure(error?.response?.data));
    // showErrorAlert(error?.response?.data?.meta?.message);
  }
}
export function* getWardListSaga(action) {
  let items = yield select(getItem);

  let header = {
    Accept: 'application/json',
    contenttype: 'application/json',
    accesstoken: items?.getTokenResponse,
  };
  try {
    let response = yield call(getApi, `get-wards/${action.payload}`, header);

    if (response?.data?.meta?.code == 200) {
      yield put(getWardListSuccess(response?.data?.data));
    } else {
      yield put(getWardListFailure(response?.data));
      showErrorAlert(response?.data?.meta?.message);
    }
  } catch (error) {
    console.log('error>>>>>>>>>>', error);

    yield put(getWardListFailure(error?.response?.data));
    if (error?.response?.data?.meta?.message == 'Token is invalid or expired') {
      yield call(AsyncStorage.removeItem, constants.TOKEN);
      yield put(getTokenSuccess(null));
      yield put(logoutSuccess());
    }
  }
}
const watchFunction = [
  (function* () {
    yield takeLatest('Profile/userDetailsRequest', userDetailsSaga);
  })(),
  (function* () {
    yield takeLatest('Profile/offenceTypesRequest', offenceTypesSaga);
  })(),
  (function* () {
    yield takeLatest('Profile/challanListRequest', challanListSaga);
  })(),
  (function* () {
    yield takeLatest('Profile/createEChallanRequest', createEChallanSaga);
  })(),
  (function* () {
    yield takeLatest('Profile/razorPayCreateOrderIDRequest', razorPayCreateOrderIDSaga);
  })(),
  (function* () {
    yield takeLatest('Profile/verifyPaymentRequest', verifyPaymentSaga);
  })(),
  (function* () {
    yield takeLatest('Profile/paybyCashRequest', payByCashSaga);
  })(),
  (function* () {
    yield takeLatest('Profile/getWardListRequest', getWardListSaga);
  })(),
];

export default watchFunction;
