import { useDispatch, useSelector } from "react-redux";

/** Typé pour éviter les imports répétitifs */
export const useAppDispatch = () => useDispatch();
export const useAppSelector = useSelector;
