import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  status: {},
  isLoading: true,
  error: {},
  userDetailsResponse: {},
  offenceTypesResponse: {},
  createEChallanResponse: {},
  challanListResponse: {},
  razorPayCreateOrderIDResponse: {},
  verifyPaymentResponse: {},
  paybyCashResponse: {},
};

const ProfileSlice = createSlice({
  name: 'Profile',
  initialState,
  reducers: {
    userDetailsRequest(state, action) {
      state.status = action.type;
    },
    userDetailsSuccess(state, action) {
      state.userDetailsResponse = action.payload;
      state.status = action.type;
    },
    userDetailsFailure(state, action) {
      state.error = action.error;
      state.status = action.type;
    },
    offenceTypesRequest(state, action) {
      state.status = action.type;
    },
    offenceTypesSuccess(state, action) {
      state.offenceTypesResponse = action.payload;
      state.status = action.type;
    },
    offenceTypesFailure(state, action) {
      state.error = action.error;
      state.status = action.type;
    },

    createEChallanRequest(state, action) {
      state.status = action.type;
    },
    createEChallanSuccess(state, action) {
      state.createEChallanResponse = action.payload;
      state.status = action.type;
    },
    createEChallanFailure(state, action) {
      state.error = action.error;
      state.status = action.type;
    },

    challanListRequest(state, action) {
      state.status = action.type;
    },
    challanListSuccess(state, action) {
      state.challanListResponse = action.payload;
      state.status = action.type;
    },
    challanListFailure(state, action) {
      state.error = action.error;
      state.status = action.type;
    },

    razorPayCreateOrderIDRequest(state, action) {
      state.status = action.type;
    },
    razorPayCreateOrderIDSuccess(state, action) {
      state.razorPayCreateOrderIDResponse = action.payload;
      state.status = action.type;
    },
    razorPayCreateOrderIDFailure(state, action) {
      state.error = action.error;
      state.status = action.type;
    },

    verifyPaymentRequest(state, action) {
      state.status = action.type;
    },
    verifyPaymentSuccess(state, action) {
      state.verifyPaymentResponse = action.payload;
      state.status = action.type;
    },
    verifyPaymentFailure(state, action) {
      state.error = action.error;
      state.status = action.type;
    },

    paybyCashRequest(state, action) {
      state.status = action.type;
    },
    paybyCashSuccess(state, action) {
      state.paybyCashResponse = action.payload;
      state.status = action.type;
    },
    paybyCashFailure(state, action) {
      state.error = action.error;
      state.status = action.type;
    },

    getWardListRequest(state, action) {
      state.status = action.type;
    },
    getWardListSuccess(state, action) {
      state.getWardListResponse = action.payload;
      state.status = action.type;
    },
    getWardListFailure(state, action) {
      state.error = action.error;
      state.status = action.type;
    },
  },
});

export const {
  userDetailsRequest,
  userDetailsSuccess,
  userDetailsFailure,

  offenceTypesRequest,
  offenceTypesSuccess,
  offenceTypesFailure,

  createEChallanRequest,
  createEChallanSuccess,
  createEChallanFailure,

  challanListRequest,
  challanListSuccess,
  challanListFailure,

  razorPayCreateOrderIDRequest,
  razorPayCreateOrderIDSuccess,
  razorPayCreateOrderIDFailure,

  verifyPaymentRequest,
  verifyPaymentSuccess,
  verifyPaymentFailure,

  paybyCashRequest,
  paybyCashSuccess,
  paybyCashFailure,

  getWardListRequest,
  getWardListSuccess,
  getWardListFailure,
} = ProfileSlice.actions;

export default ProfileSlice.reducer;
